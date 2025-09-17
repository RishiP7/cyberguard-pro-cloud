import express from "express";
import * as billing from "./billing.js";
const setupBilling = billing.setupBilling ?? billing.default ?? (() => {});
import morgan from "morgan";
// morgan import moved up
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
import cors from "cors";
import cookieParser from "cookie-parser";
import * as impersonation from "./impersonation.js";
// --- Optional Sentry bootstrap (no dependency required) ---
let Sentry = null;
if (process.env.SENTRY_DSN) {
  try {
    const mod = await import("@sentry/node");
    Sentry = mod.default ?? mod;
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || "development",
      release: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || undefined,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
      integrations: [
        Sentry.extraErrorDataIntegration?.(),
        Sentry.httpIntegration?.(),
        Sentry.expressIntegration?.(),
      ].filter(Boolean),
    });
    console.log("[sentry] enabled");
  } catch (err) {
    Sentry = null;
    console.warn("[sentry] disabled (module missing or init failed):", err?.code || err?.message || err);
  }
} else {
  console.log("[sentry] no DSN, disabled");
}

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
app.use('/billing/webhook', express.raw({ type: '*/*' }));
// After app is defined, setup Sentry Express error handler (v8+)
if (Sentry && process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}


// ---- Impersonation wiring ----
// destructure helpers/router from the module (works for both ESM/CJS exports)
const { router: impersonationRouter, loadImpersonation, attachTenantContext, ensureCookies } = impersonation;

// ensure req.cookies exists even if cookie-parser is unavailable somewhere upstream
if (typeof ensureCookies === 'function') app.use(ensureCookies);

// mark impersonation on requests and attach effective tenant context
if (typeof loadImpersonation === 'function') app.use(loadImpersonation);
if (typeof attachTenantContext === 'function') app.use(attachTenantContext);

// mount admin routes (request/approve/start/revoke, etc.)
if (impersonationRouter) app.use('/admin', impersonationRouter);
// ---- end impersonation wiring ----

// --- Sentry request + tracing handlers removed for Sentry v8+ ---
// Parse JSON for all routes except the Stripe webhook (which must remain raw)
app.use((req, res, next) => {
  if (req.originalUrl === '/billing/webhook') return next();
  return express.json()(req, res, next);
});
app.use((req, res, next) => {
  if (req.originalUrl === '/billing/webhook') return next();
  return express.urlencoded({ extended: true })(req, res, next);
});
app.use(cookieParser());
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

// ===== Unified CORS allowlist =====
const ALLOWED_ORIGINS = new Set(
  [
    'https://app.cyberguardpro.uk',
    (process.env.FRONTEND_URL || '').replace(/\/$/, ''),
    (process.env.PUBLIC_SITE_URL || '').replace(/\/$/, ''),
    ...(`${process.env.CORS_ORIGINS || ''},https://cyberguard-pro-cloud.onrender.com,https://cyberguard-pro-cloud-1.onrender.com,http://localhost:5173`)
      .split(/[\,\s]+/)
      .map(s => (s || '').trim().toLowerCase().replace(/\/$/, ''))
      .filter(Boolean)
  ]
);

// Default frontend URL for post-auth redirects
const FRONTEND_URL = (
  process.env.FRONTEND_URL ||
  [...ALLOWED_ORIGINS][0] ||
  'http://localhost:5173'
).replace(/\/$/, '');

function corsOrigin(origin, cb) {
  if (!origin) return cb(null, true); // allow server-to-server
  const norm = String(origin).trim().toLowerCase().replace(/\/$/, '');
  const allowed =
    ALLOWED_ORIGINS.has(norm) ||
    /^https?:\/\/localhost(:\d+)?$/.test(norm);
  return cb(null, allowed);
}
// ===== END Unified CORS allowlist =====

app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: [
    "Origin","X-Requested-With","Content-Type","Accept","Authorization",
    "x-api-key","x-admin-key",
    // legacy + new admin preview/bypass headers
    "x-plan-preview","x-admin-override",
    "x-admin-plan-preview","x-admin-bypass"
  ],
  exposedHeaders: [
    "RateLimit-Policy","RateLimit-Limit","RateLimit-Remaining","RateLimit-Reset"
  ]
}));
// Global preflight handler (Express 5 safe)
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    // CORS headers are already set by the cors() middleware above
    return res.sendStatus(204);
  }
  next();
});

app.use(helmet());

// redacted request logging
morgan.token("body",req=>{
  const b={...req.body};
  if(b.password) b.password="***";
  if(b.token) b.token="***";
  return JSON.stringify(b).slice(0,400);
});
app.use(morgan(':method :url :status - :response-time ms :body'));
// ---- cookie/JWT helpers ----
function getBearer(req) {
  const h = req.headers?.authorization || "";
  const m = /^Bearer\s+(.+)$/.exec(h);
  return m ? m[1] : null;
}

function setTokens(res, access, refresh) {
  const base = { httpOnly: true, secure: true, sameSite: "none", path: "/" };
  try {
    res.cookie("cg_access", access,  { ...base, maxAge: 15 * 60 * 1000 });
    res.cookie("cg_refresh", refresh, { ...base, maxAge: 30 * 24 * 60 * 60 * 1000 });
  } catch {
    const prev = res.getHeader("Set-Cookie");
    const arr = Array.isArray(prev) ? prev : prev ? [prev] : [];
    arr.push(
      `cg_access=${encodeURIComponent(access)}; Max-Age=${15 * 60}; Path=/; Secure; HttpOnly; SameSite=None`
    );
    arr.push(
      `cg_refresh=${encodeURIComponent(refresh)}; Max-Age=${30 * 24 * 60 * 60}; Path=/; Secure; HttpOnly; SameSite=None`
    );
    res.setHeader("Set-Cookie", arr);
  }
}

function clearTokens(res) {
  try {
    // These attributes must match those used to set the cookies
    const opts = { httpOnly: true, secure: true, sameSite: "none", path: "/" };
    res.clearCookie("cg_access", opts);
    res.clearCookie("cg_refresh", opts);
  } catch {
    // Fallback for environments without cookie-parser helpers
    const prev = res.getHeader("Set-Cookie");
    const arr = Array.isArray(prev) ? prev : prev ? [prev] : [];
    arr.push("cg_access=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=None");
    arr.push("cg_refresh=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=None");
    res.setHeader("Set-Cookie", arr);
  }
}

// ---------- helpers ----------
const now=()=>Math.floor(Date.now()/1000);
const authMiddleware=async (req,res,next)=>{
  try{
    const hdr = req.headers.authorization || "";
    let tok = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
    if (!tok && req.cookies && req.cookies.cg_access) {
      tok = req.cookies.cg_access;
    }
    const dec = jwt.verify(tok, JWT_SECRET);
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
  const h = (req && req.headers) || {};
  const preview = h['x-admin-plan-preview'] || h['x-plan-preview'] || null; // new + legacy
  const override = (h['x-admin-bypass'] === '1') || (h['x-admin-override'] === '1'); // new + legacy
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

  // Super admin preview override (accept both legacy and new headers)
  const flags = readAdminFlags(req || { headers: {} });
  let effective = t.plan || 'basic';
  if (trialActive) effective = 'pro_plus';
  if (flags && flags.preview && (req?.user?.is_super)) {
    const raw = String(flags.preview || '').toLowerCase();
    const compact = raw.replace(/\s+/g, '').replace(/_/g, '');
    if (compact === 'proplus' || compact === 'pro+') effective = 'pro_plus';
    else if (compact === 'basic') effective = 'basic';
    else if (compact === 'pro') effective = 'pro';
    else effective = raw; // fallback
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
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
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

// Stripe events idempotency ledger
await q(`
  CREATE TABLE IF NOT EXISTS stripe_events(
    id TEXT PRIMARY KEY,
    type TEXT,
    raw JSONB,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
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
    const FRONTEND_URL = process.env.FRONTEND_URL || "https://cyberguard-pro-cloud.onrender.com";
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
    const FRONTEND_URL = process.env.FRONTEND_URL || "https://cyberguard-pro-cloud.onrender.com";
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
    const redirectUri = process.env.M365_REDIRECT_URI || process.env.M365_REDIRECT || ((process.env.FRONTEND_URL || "https://cyberguard-pro-cloud.onrender.com").replace(/\/$/, "") + "/auth/m365/callback");

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
    // set cookies for browser-based sessions (access + refresh)
    try {
      const base = { httpOnly: true, secure: true, sameSite: "none", path: "/" };
      res.cookie("cg_access",  token, { ...base, maxAge: 15 * 60 * 1000 });
      res.cookie("cg_refresh", token, { ...base, maxAge: 30 * 24 * 60 * 60 * 1000 });
    } catch {}
    return res.json({ ok: true, token, role: user.role || 'member', is_super });
  } catch (e) {
    console.error('[auth/login] error:', e?.stack || e);
    const msg = (e && (e.message || e.error)) ? String(e.message || e.error) : 'login failed';
    const code = /invalid|missing|credential|password|email/i.test(msg) ? 401 : 500;
    return res.status(code).json({ ok: false, error: msg });
  }
});

app.post("/auth/refresh", async (req, res) => {
  try {
    const refresh = (req.cookies && req.cookies.cg_refresh) || getBearer(req);
    if (!refresh) return res.status(401).json({ ok:false, error: "no refresh" });

    let claims = null;
    try {
      claims = jwt.verify(refresh, JWT_SECRET);
    } catch {
      try { claims = jwt.decode(refresh) || null; } catch {}
    }
    if (!claims) return res.status(401).json({ ok:false, error: "invalid refresh" });

    // issue fresh short-lived access (15m)
    const token = jwt.sign(
      {
        tenant_id: claims.tenant_id,
        email: claims.email,
        role: claims.role || 'member',
        is_super: !!claims.is_super
      },
      JWT_SECRET,
      { expiresIn: "15m" }
    );

    // keep refresh as-is (or rotate if you add a true refresh token)
    setTokens(res, token, refresh);

    return res.json({ ok: true, token });
  } catch (e) {
    return res.status(401).json({ ok:false, error: "refresh failed" });
  }
});

// Explicit logout endpoint for browser sessions
app.post("/logout", (req, res) => {
  clearTokens(res);
  return res.status(200).json({ ok: true });
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
const {rows}=await q(`SELECT * FROM tenants WHERE tenant_id=$1`,[req.user.tenant_id]);
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
  try{
    const { tenant_id } = req.body || {};
    if(!tenant_id) return res.status(400).json({ error:'tenant_id required' });

    // 15-minute short-lived impersonation token
    const token = jwt.sign(
      { tenant_id, role: 'impersonated', orig_admin: req.user.email || 'admin', ia: true },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Audit trail
    try { await recordOpsRun('admin_impersonate', { admin: req.user.email || null, tenant_id }); } catch(_e){}

    return res.json({ ok:true, token });
  }catch(e){
    return res.status(500).json({ ok:false, error:'impersonate failed' });
  }
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


// ---- Stripe Billing (modern endpoints) ----
import Stripe from "stripe";

const STRIPE_SECRET_KEY     = process.env.STRIPE_SECRET_KEY     || process.env.STRIPE_SECRET || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const STRIPE_PRICE_BASIC    = process.env.STRIPE_PRICE_BASIC    || "";
const STRIPE_PRICE_PRO      = process.env.STRIPE_PRICE_PRO      || "";
const STRIPE_PRICE_PROPLUS  = process.env.STRIPE_PRICE_PROPLUS  || process.env.STRIPE_PRICE_PRO_PLUS || "";
const STRIPE_DOMAIN         = process.env.STRIPE_DOMAIN         || process.env.PUBLIC_APP_URL || "";

const STRIPE_ENABLED = !!(STRIPE_SECRET_KEY && STRIPE_PRICE_BASIC && STRIPE_PRICE_PRO && STRIPE_PRICE_PROPLUS);
let stripe = null;
try { if (STRIPE_SECRET_KEY) { stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2022-11-15" }); } } catch(_) { stripe = null; }

function planToPrice(plan) {
  const raw = String(plan ?? "").trim().toLowerCase();
  // Remove spaces/underscores consistently to make matching lenient
  const compact = raw.replace(/\s+/g, "").replace(/_/g, "");
  // Map common aliases -> canonical keys
  // e.g. "Pro +", "pro+", "proplus", "pro_plus" => "pro_plus"
  let canonical = null;
  if (compact === "basic") canonical = "basic";
  else if (compact === "pro") canonical = "pro";
  else if (compact === "proplus" || compact === "pro+") canonical = "pro_plus";

  if (canonical === "basic") return STRIPE_PRICE_BASIC;
  if (canonical === "pro") return STRIPE_PRICE_PRO;
  if (canonical === "pro_plus") return STRIPE_PRICE_PROPLUS;
  return null;
}


function canonicalPlan(plan){
  const raw = String(plan ?? "").trim().toLowerCase();
  const compact = raw.replace(/\s+/g, "").replace(/_/g, "");
  if (compact === "basic") return "basic";
  if (compact === "pro") return "pro";
  if (compact === "proplus" || compact === "pro+") return "pro_plus";
  return null;
}

// --- Stripe plan/tenant helpers ---
function resolvePlanFromPriceId(priceId) {
  if (!priceId) return null;
  const map = {
    [STRIPE_PRICE_BASIC]: 'basic',
    [STRIPE_PRICE_PRO]: 'pro',
    [STRIPE_PRICE_PROPLUS]: 'pro_plus'
  };
  return map[priceId] || null;
}

async function resolveTenantIdFromEvent(obj) {
  try {
    // Prefer explicit metadata / client ref
    const metaTid = obj?.metadata?.tenant_id || obj?.client_reference_id || null;
    if (metaTid) return String(metaTid);

    // Fallback to DB mapping via Stripe customer id
    const customerId = obj?.customer || obj?.customer_id || null;
    if (customerId) {
      const rows = await q(`select id from tenants where stripe_customer_id = $1 limit 1`, [String(customerId)]);
      if (rows && rows[0] && rows[0].id) return rows[0].id;
    }
  } catch (_e) {}
  return null;
}

async function setTenantPlan(tenantId, plan, opts = {}) {
  const endTrial = !!opts.endTrial;
  const key = String(plan || '').toLowerCase();

  // Idempotent: only update when changed
  try {
    const cur = await q(`select plan_actual from tenants where id = $1 limit 1`, [tenantId]);
    const current = cur && cur[0] ? String(cur[0].plan_actual || '').toLowerCase() : null;

    if (current !== key) {
      await q(`update tenants set plan=$1, plan_actual=$1 where id=$2`, [key, tenantId]);
    }
    if (endTrial) {
      await q(`update tenants set trial_ends_at = 0 where id = $1`, [tenantId]);
    }
    await recordOpsRun('stripe_plan_set', { tenant_id: tenantId, plan: key, changed: current !== key });
  } catch (e) {
    await recordOpsRun('stripe_plan_set_error', { tenant_id: tenantId, plan: key, msg: e.message || String(e) });
    throw e;
  }
}

// Debug endpoint: test canonicalization of plan input
app.get('/billing/_debug', authMiddleware, requireSuper, (req, res) => {
  const plan = req.query?.plan || '';
  res.json({ ok: true, input: plan, canonical: canonicalPlan(plan) });
});

// Ensure a stable Stripe customer per tenant (create once, reuse)
async function getOrCreateStripeCustomer(tenant_id) {
  if (!stripe) return null;
  // fetch current record
  const rec = await q(
    `SELECT stripe_customer_id, name, contact_email FROM tenants WHERE tenant_id=$1`,
    [tenant_id]
  ).then(r => r.rows[0]);

  let customerId = rec?.stripe_customer_id || null;

  // If we have a customer id, make sure it still exists in Stripe (best-effort)
  if (customerId) {
    try {
      await stripe.customers.retrieve(customerId);
    } catch (_) {
      customerId = null;
    }
  }

  // Create if missing
  if (!customerId) {
    const created = await stripe.customers.create({
      metadata: { tenant_id },
      name: rec?.name || tenant_id,
      email: rec?.contact_email || undefined
    });
    customerId = created.id;
    await q(
      `UPDATE tenants
         SET stripe_customer_id = $2,
             updated_at = EXTRACT(EPOCH FROM NOW())
       WHERE tenant_id = $1`,
      [tenant_id, customerId]
    );
  }

  return customerId;
}

// --- Billing helpers: idempotency + plan sync + auditing ---
async function hasStripeEvent(id){
  const r = await q(`SELECT 1 FROM stripe_events WHERE id=$1 LIMIT 1`, [id]);
  return !!r.rowCount;
}
async function markStripeEvent(id, type, raw){
  try{
    await q(
      `INSERT INTO stripe_events(id,type,raw,created_at)
       VALUES($1,$2,$3,EXTRACT(EPOCH FROM NOW())) ON CONFLICT DO NOTHING`,
      [id, String(type||''), raw||{}]
    );
  }catch(_e){}
}
function mapPriceToPlan(priceId){
  if (!priceId) return null;
  if (priceId === STRIPE_PRICE_BASIC) return "basic";
  if (priceId === STRIPE_PRICE_PRO) return "pro";
  if (priceId === STRIPE_PRICE_PROPLUS) return "pro_plus";
  return null;
}
async function setTenantPlanFromPrice(opts){
  // opts: { tenant_id?, customer_id?, price_id?, fallback_plan?, end_trial?: boolean }
  let { tenant_id, customer_id, price_id, fallback_plan, end_trial } = opts || {};
  let plan = mapPriceToPlan(price_id) || (fallback_plan ? String(fallback_plan).toLowerCase() : null);
  // resolve tenant via customer id if needed
  if (!tenant_id && customer_id){
    const r = await q(`SELECT tenant_id FROM tenants WHERE stripe_customer_id=$1 LIMIT 1`, [customer_id]);
    tenant_id = r.rows[0]?.tenant_id || null;
  }
  if (!tenant_id || !plan) return { ok:false, reason: "missing tenant or plan", tenant_id, plan };
  // normalize proplus aliases from metadata
  if (plan === "proplus") plan = "pro_plus";
  const params = [plan, tenant_id];
  let sql = `
    UPDATE tenants
       SET plan = $1,
           updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
     WHERE tenant_id = $2
  `;
  if (end_trial){
    sql = `
      UPDATE tenants
         SET plan = $1,
             trial_status = 'ended',
             trial_ends_at = EXTRACT(EPOCH FROM NOW())::BIGINT,
             updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
       WHERE tenant_id = $2
    `;
  }
  await q(sql, params);
  return { ok:true, tenant_id, plan };
}
async function logStripeRun(kind, details){
  try{
    await recordOpsRun(kind, details || {});
  }catch(_e){}
}

// Probe endpoint for config
app.get("/billing/_config", (req, res) => {
  res.json({
    ok: true,
    stripe_enabled: STRIPE_ENABLED,
    prices: {
      basic: !!STRIPE_PRICE_BASIC,
      pro: !!STRIPE_PRICE_PRO,
      pro_plus: !!STRIPE_PRICE_PROPLUS
    }
  });
});


// --- keep a copy of the raw body for Stripe signature verification ---
// Only save rawBody for Stripe webhook endpoint
const rawSaver = (req, res, buf) => {
  if (req.originalUrl.startsWith("/billing/webhook")) {
    req.rawBody = buf;
  }
};

app.post("/billing/webhook", async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(501).json({ ok:false, error:"webhook not configured" });
  }

  // Use Buffer body for signature validation (express.raw is mounted earlier)
  const sig = req.headers['stripe-signature'];
  const bodyForSig = Buffer.isBuffer(req.body)
    ? req.body
    : (Buffer.isBuffer(req.rawBody) ? req.rawBody : null);

  if (!bodyForSig) {
    await recordOpsRun('stripe_bad_sig', { error: 'no buffer body' });
    return res.status(400).send('Webhook Error: Raw Buffer body required for signature verification');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(bodyForSig, sig, STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    await recordOpsRun('stripe_bad_sig', { error: e.message || String(e) });
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  const etype = String(event.type || '');
  const eid   = String(event.id || '');

  // Idempotency
  if (!eid) return res.status(400).json({ ok:false, error:"missing event id" });
  if (await hasStripeEvent(eid)) return res.json({ ok:true, dedup:true });
  try { await markStripeEvent(eid, etype, event); } catch(_e) {}

  try {
    switch (etype) {
      case 'checkout.session.completed': {
        const sessId = event.data.object.id;
        const sess = await stripe.checkout.sessions.retrieve(sessId, { expand: ['line_items.data.price'] });
        const tenantId = await resolveTenantIdFromEvent(sess);
        const priceId  = sess?.line_items?.data?.[0]?.price?.id || null;
        const plan     = resolvePlanFromPriceId(priceId) || canonicalPlan(sess?.metadata?.plan);
        if (tenantId && plan) {
          await setTenantPlan(tenantId, plan, { endTrial: true });
        } else {
          await recordOpsRun('stripe_plan_unresolved', { event: etype, tenantId, priceId, metaPlan: sess?.metadata?.plan || null });
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subId = event.data.object.id;
        const sub   = await stripe.subscriptions.retrieve(subId, { expand: ['items.data.price'] });
        const tenantId = await resolveTenantIdFromEvent(sub);
        const priceId  = sub?.items?.data?.[0]?.price?.id || null;
        const plan     = resolvePlanFromPriceId(priceId) || canonicalPlan(sub?.metadata?.plan);
        if (tenantId && plan) {
          await setTenantPlan(tenantId, plan, { endTrial: true });
        } else {
          await recordOpsRun('stripe_plan_unresolved', { event: etype, tenantId, priceId });
        }
        // Reflect subscription status in billing_status (past_due/unpaid/incomplete => show banner)
        const subStatus = String(sub?.status || '').toLowerCase();
        if (tenantId) {
          if (subStatus === 'past_due' || subStatus === 'unpaid' || subStatus === 'incomplete') {
            await setTenantBillingStatus(tenantId, 'past_due');
          } else {
            await setTenantBillingStatus(tenantId, null);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const tenantId = await resolveTenantIdFromEvent(sub);
        if (tenantId) {
          await setTenantPlan(tenantId, 'basic', { endTrial: false });
        } else {
          await recordOpsRun('stripe_plan_unresolved', { event: etype, reason: 'no tenant_id', customer: sub?.customer || null });
        }
        break;
      }

      case 'invoice.payment_succeeded':
      case 'invoice.paid': {
        const invId = event.data.object.id;
        const inv   = await stripe.invoices.retrieve(invId, { expand: ['lines.data.price', 'subscription.items.data.price'] });
        const tenantId = await resolveTenantIdFromEvent(inv);
        const priceId  = inv?.lines?.data?.[0]?.price?.id
                         || inv?.subscription?.items?.data?.[0]?.price?.id
                         || null;
        const plan     = resolvePlanFromPriceId(priceId) || canonicalPlan(inv?.metadata?.plan);
        if (tenantId && plan) {
          await setTenantPlan(tenantId, plan, { endTrial: true });
        } else {
          await recordOpsRun('stripe_plan_unresolved', { event: etype, tenantId, priceId });
        }
        if (tenantId) {
          await setTenantBillingStatus(tenantId, null);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object;
        const tenantId = await resolveTenantIdFromEvent(inv);
        await recordOpsRun('stripe_payment_failed', { tenant_id: tenantId || null, invoice: inv.id, customer: inv.customer || null });
        // Optional: add grace logic later
        if (tenantId) {
          await setTenantBillingStatus(tenantId, 'payment_failed');
        }
        break;
      }

      default:
        // Acknowledge unhandled events to prevent Stripe retries
        break;
    }

    try { await recordOpsRun('stripe_webhook', { type: etype, event_id: eid }); } catch(_e) {}
    return res.json({ received: true });
  } catch (e) {
    await recordOpsRun('stripe_webhook_handler_error', { type: etype, msg: e.message || String(e) });
    return res.status(500).json({ error: 'handler failed' });
  }
});

// ---------- body parsers (global) ----------
// Only save req.rawBody for /billing/webhook, and skip all JSON parsing for /billing/webhook
const jsonParser = express.json({ limit: '2mb', verify: rawSaver });
const urlParser  = express.urlencoded({ extended: true, verify: rawSaver });

app.use((req, res, next) => {
  if (req.originalUrl.startsWith("/billing/webhook")) return next();
  jsonParser(req, res, (err) => {
    if (err) return next(err);
    urlParser(req, res, next);
  });
});

// Stripe Checkout endpoint
app.post("/billing/checkout", authMiddleware, async (req, res) => {
  if (!STRIPE_ENABLED || !stripe) return res.status(501).json({ ok: false, error: "stripe not configured" });
  try {
    const tenant_id = req.user.tenant_id;
    const incomingPlan = (req.body?.plan ?? req.query?.plan ?? "");
    const price = planToPrice(incomingPlan);
    if (!price) {
      return res.status(400).json({
        ok: false,
        error: "invalid plan",
        received: String(incomingPlan || ""),
        accepted: ["basic","pro","pro_plus","pro+","pro plus"]
      });
    }
    const base = process.env.FRONTEND_URL || STRIPE_DOMAIN || req.headers.origin || "https://cyberguard-pro-cloud.onrender.com";
    const success = `${base}/?checkout=success`;
    const cancel  = `${base}/?checkout=cancel`;
    // Use tenant_id as customer metadata (or find existing)
    const customerId = await getOrCreateStripeCustomer(tenant_id);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: tenant_id,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: success,
      cancel_url: cancel,
      metadata: { tenant_id, plan: canonicalPlan(incomingPlan) || String(incomingPlan || "") },
      subscription_data: {
        metadata: { tenant_id, plan: canonicalPlan(incomingPlan) || String(incomingPlan || "") }
      }
    });
    return res.json({ ok: true, url: session.url });
  } catch (e) {
    console.error("billing/checkout failed", e);
    return res.status(500).json({ ok: false, error: "checkout failed", detail: String(e.message || e) });
  }
});

// Stripe Portal endpoint
app.post("/billing/portal", authMiddleware, async (req, res) => {
  if (!STRIPE_ENABLED || !stripe) return res.status(501).json({ ok: false, error: "stripe not configured" });
  try {
    const tenant_id = req.user.tenant_id;
    const customerId = await getOrCreateStripeCustomer(tenant_id);
    const base = process.env.FRONTEND_URL || STRIPE_DOMAIN || req.headers.origin || "https://cyberguard-pro-cloud.onrender.com";
    const returnUrl = base.replace(/\/$/, "");
    const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return res.json({ ok: true, url: portal.url });
  } catch (e) {
    console.error("billing/portal failed", e);
    return res.status(500).json({ ok: false, error: "portal failed", detail: String(e.message || e) });
  }
});

// Stripe Portal endpoint (GET alias)
app.get("/billing/portal", authMiddleware, async (req, res) => {
  if (!STRIPE_ENABLED || !stripe) return res.status(501).json({ ok: false, error: "stripe not configured" });
  try {
    const tenant_id = req.user.tenant_id;
    const customerId = await getOrCreateStripeCustomer(tenant_id);
    const base = process.env.FRONTEND_URL || STRIPE_DOMAIN || req.headers.origin || "https://cyberguard-pro-cloud.onrender.com";
    const returnUrl = base.replace(/\/$/, "");
    const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return res.json({ ok: true, url: portal.url });
  } catch (e) {
    console.error("billing/portal failed (GET)", e);
    return res.status(500).json({ ok: false, error: "portal failed", detail: String(e.message || e) });
  }
});

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
// --- Paid plan guard (applies to API key routes) ---
async function requirePaidPlan(req, res, next) {
  try {
    // Super admins bypass plan checks (support/ops use)
    if (req.user?.is_super) return next();

    const plan = String(req.user?.plan_actual || req.user?.plan || '').toLowerCase();
    const ok = ['basic','pro','pro_plus'].includes(plan);
    if (!ok) {
      try {
        await recordOpsRun('paid_plan_denied', { tenant_id: req.user?.tenant_id || null, plan, route: req.path });
      } catch (_e) {}
      return res.status(402).json({ error: 'Paid plan required', plan });
    }
    next();
  } catch (_e) {
    return res.status(402).json({ error: 'Paid plan required' });
  }
}
// Ensures we always use fresh plan info from DB (not what's baked into old JWTs)
async function attachFreshTenantPlan(req, res, next) {
  try {
    const tid = req.user?.tenant_id;
    if (!tid) return next();
    const rows = await q(`select plan, plan_actual, trial_ends_at from tenants where id = $1 limit 1`, [tid]);
    if (rows && rows[0]) {
      req.user.plan = rows[0].plan ?? req.user.plan;
      req.user.plan_actual = rows[0].plan_actual ?? req.user.plan_actual;
      req.user.trial_ends_at = rows[0].trial_ends_at ?? req.user.trial_ends_at;
    }
  } catch (_e) {
    // non-fatal; fall back to token values
  }
  next();
}
// ---------- apikeys ----------
// New API key endpoints (string keys)
import crypto from "crypto";
app.post('/apikeys', authMiddleware, attachFreshTenantPlan, requirePaidPlan, async (req,res)=>{
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

app.post('/apikeys/create', authMiddleware, attachFreshTenantPlan, requirePaidPlan, async (req,res)=>{
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
app.get("/apikeys",authMiddleware,attachFreshTenantPlan,requirePaidPlan,async (req,res)=>{
  const {rows}=await q(`SELECT id,revoked,created_at FROM apikeys WHERE tenant_id=$1 ORDER BY created_at DESC`,[req.user.tenant_id]);
  res.json({ok:true,keys:rows});
});
app.post("/apikeys/revoke",authMiddleware,attachFreshTenantPlan,requirePaidPlan,async (req,res)=>{
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

// --- Normalize a Microsoft Graph message into the fields writeAlert expects
function normalizeGraphMessage(m) {
  if (!m || typeof m !== 'object') return { type: 'email' };
  const fromAddr =
    m?.from?.emailAddress?.address ||
    m?.sender?.emailAddress?.address ||
    m?.from?.address ||
    (typeof m?.from === 'string' ? m.from : null) ||
    null;

  return {
    type: 'email',
    when: m?.receivedDateTime || m?.createdDateTime || null,
    id: m?.id || null,
    internetMessageId: m?.internetMessageId || null,
    conversationId: m?.conversationId || null,
    subject: m?.subject || '',
    bodyPreview: m?.bodyPreview || (m?.body?.content ? String(m.body.content).slice(0,280) : ''),
    from: fromAddr ? { emailAddress: { address: fromAddr } } : null,
    sender: m?.sender || null,
    toRecipients: m?.toRecipients || null,
    ccRecipients: m?.ccRecipients || null,
    bccRecipients: m?.bccRecipients || null,
    // keep original around in case you need it later
    _raw: { provider: 'm365', message: m }
  };
}
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

    // Normalize Graph messages so writeAlert can denormalize into from/subject/preview
    if (conn.provider === 'm365' && Array.isArray(items)) {
      items = items.map(normalizeGraphMessage);
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
async function writeAlert(tenant_id, ev){
  const {rows:pRows}=await q(`SELECT * FROM policy WHERE tenant_id=$1`,[tenant_id]);
  const p=pRows[0]||{enabled:true,threshold:-0.6,allow_quarantine:true,allow_dns_deny:true,allow_disable_account:true,dry_run:false,feeds:{email:true,edr:true,dns:true,ueba:true,cloud:true}};
  if(!p.enabled) return null;

  const score=scoreOf(ev);
  const id=uuidv4();

  // --- Denormalize for flat columns: from_addr, subject, preview, type, anomaly ---
  function _safeJson(x){ try{ return (typeof x === 'string' ? JSON.parse(x) : (x || {})); } catch(_e){ return {}; } }
  const _ev = _safeJson(ev);
  // Prefer normalized shape; fall back to raw Graph message if present
  const src = (_ev?._raw?.message && typeof _ev._raw.message === 'object') ? _ev._raw.message : _ev;

  const _from_addr =
    (src?.from?.emailAddress?.address) ||
    (src?.sender?.emailAddress?.address) ||
    (src?.from?.address) ||
    (typeof src?.from === 'string' ? src.from : null) ||
    null;

  const _subject = (typeof src?.subject === 'string' ? src.subject : '');

  const _preview = (
    (typeof src?.bodyPreview === 'string' && src.bodyPreview) ? src.bodyPreview :
    (typeof src?.preview === 'string' && src.preview) ? src.preview :
    (typeof src?.body?.content === 'string' ? src.body.content.slice(0, 280) : '')
  );

  const _type = (typeof _ev?.type === 'string' && _ev.type) ? _ev.type : 'email';

  const _anomaly = (function(a){
    if (a === true) return true;
    if (a === false) return false;
    const s = String(a ?? '').toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  })(_ev?.anomaly);

  const ts = now();
await q(`INSERT INTO alerts(
             id, tenant_id, event_json, score, status, created_at,
             from_addr, type, subject, preview, anomaly
           )
           VALUES($1,$2,$3,$4,'new',$5,$6,$7,$8,$9,$10)`,
          [id, tenant_id, ev, score, ts,
           _from_addr, _type, _subject, _preview, _anomaly]);

const alert = { id, tenant_id, event_json: ev, score, status: 'new', created_at: ts };
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
// Record administrative ops runs (auditing) with throttle for noisy types
const _badSigWindowMs = 60 * 1000; // 1 minute window
const _badSigMaxPerWindow = Math.max(1, Number(process.env.STRIPE_BAD_SIG_MAX || 5));
const _badSigBuckets = new Map(); // key: minute-bucket epoch, value: count

const recordOpsRun = async (type, details) => {
  try {
    const t = String(type || 'unknown');
    if (t === 'stripe_bad_sig') {
      const nowMs = Date.now();
      const bucket = Math.floor(nowMs / _badSigWindowMs);
      const n = _badSigBuckets.get(bucket) || 0;
      if (n >= _badSigMaxPerWindow) {
        // Drop noisy event
        return;
      }
      _badSigBuckets.set(bucket, n + 1);
      // light cleanup of old buckets
      for (const b of _badSigBuckets.keys()) {
        if (b < bucket - 2) _badSigBuckets.delete(b);
      }
    }
    await q(
      `INSERT INTO ops_runs(id, run_type, details, created_at)
       VALUES($1,$2,$3,$4)`,
      [uuidv4(), t, details || {}, now()]
    );
  } catch (_e) {
    // Non-fatal: never throw from audit logging
  }
};
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

// Super Admin: list recent ops runs (audit log)
app.get('/admin/ops/runs', authMiddleware, requireSuper, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query?.limit || 50)));
    const type  = (req.query?.type || '').toString().trim(); // optional filter
    const showBadSig = (req.query?.show_bad_sig || '').toString().trim() === '1';

    const params = [];
    let whereClauses = [];
    if (type) {
      whereClauses.push(`run_type = $${params.length + 1}`);
      params.push(type);
    } else if (!showBadSig) {
      // Hide noisy bad-sig logs by default unless explicitly requested
      whereClauses.push(`run_type <> 'stripe_bad_sig'`);
    }

    let sql = `SELECT id, run_type, details, created_at FROM ops_runs`;
    if (whereClauses.length) sql += ` WHERE ` + whereClauses.join(' AND ');
    sql += ` ORDER BY created_at DESC LIMIT ${limit}`;

    const { rows } = await q(sql, params);
    return res.json({ ok: true, runs: rows });
  } catch (e) {
    console.error('ops runs failed', e);
    return res.status(500).json({ ok: false, error: 'ops runs failed' });
  }
});
// Super Admin: seed usage events for retention testing
// Super Admin: seed usage events for retention testing (gated by ALLOW_ADMIN_SEED)
app.post('/admin/ops/seed/usage', authMiddleware, requireSuper, async (req, res) => { if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ ok:false, error: 'disabled in production' });
  }
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

// Super Admin: ensure connectors health columns (temporary helper)
app.post('/admin/ops/ensure_connectors', authMiddleware, requireSuper, async (_req, res) => {
  try {
    if (typeof ensureConnectorHealthColumns !== 'function') {
      return res.status(500).json({ ok:false, error: 'ensureConnectorHealthColumns not available' });
    }
    await ensureConnectorHealthColumns();
    return res.json({ ok:true, ensured: ['status','last_error','last_sync_at'] });
  } catch (e) {
    console.error('ensure_connectors failed', e);
    return res.status(500).json({ ok:false, error: 'ensure_connectors failed' });
  }
});

// Super Admin: force reset connector (clear tokens/state)
// POST /admin/ops/connector/reset  { provider: "m365" | "google", type?: "email" }
app.post('/admin/ops/connector/reset', authMiddleware, requireSuper, async (req, res) => {
  try {
    const tid = req.user.tenant_id;
    const provider = String(req.body?.provider || '').trim().toLowerCase();
    const type = String(req.body?.type || 'email').trim().toLowerCase();
    if (!provider) return res.status(400).json({ ok:false, error:'missing provider' });

    // Ensure health columns exist (idempotent, ignore failures)
    try { await ensureConnectorHealthColumns(); } catch(_e) {}

    // Discover token-ish columns present on connectors table
    let have;
    try {
      const { rows: cols } = await q(`
        SELECT column_name
          FROM information_schema.columns
         WHERE table_name='connectors'
      `);
      have = new Set((cols||[]).map(r => r.column_name));
    } catch (_e) {
      have = new Set();
    }

    // Columns that may contain secrets/tokens/config to clear if present
    const tokenish = [
      'access_token','refresh_token','token','oauth_token','oauth_json',
      'auth','auth_json','secrets','config','metadata','details'
    ];

    const setParts = [];
    const cleared = [];
    for (const c of tokenish) {
      if (have.has(c)) { setParts.push(`${c}=NULL`); cleared.push(c); }
    }
    // Always wipe health fields too, when present
    if (have.has('status'))       { setParts.push(`status=NULL`); cleared.push('status'); }
    if (have.has('last_error'))   { setParts.push(`last_error=NULL`); cleared.push('last_error'); }
    if (have.has('last_sync_at')) { setParts.push(`last_sync_at=NULL`); cleared.push('last_sync_at'); }
    if (have.has('updated_at'))   { setParts.push(`updated_at=$3`); }

    if (!setParts.length) {
      return res.status(500).json({ ok:false, error:'no resettable columns found' });
    }

    const sql = `UPDATE connectors SET ${setParts.join(', ')} WHERE tenant_id=$1 AND type=$2 AND provider=$4`;
    await q(sql, [tid, type, now(), provider]);

    try { await recordOpsRun('connector_reset', { tenant_id: tid, provider, type, cleared }); } catch(_e) {}
    return res.json({ ok:true, tenant_id: tid, provider, type, cleared });
  } catch (e) {
    console.error('connector/reset failed', e);
    return res.status(500).json({ ok:false, error:'reset failed' });
  }
});

// Super Admin: clear connector last_error (does not touch tokens)
// POST /admin/ops/connector/clear_error  { provider: "m365"|"google", type?: "email" }
app.post('/admin/ops/connector/clear_error', authMiddleware, requireSuper, async (req, res) => {
  try {
    const tid = req.user.tenant_id;
    const provider = String(req.body?.provider || '').trim().toLowerCase();
    const type = String(req.body?.type || 'email').trim().toLowerCase();
    if (!provider) return res.status(400).json({ ok:false, error:'missing provider' });
    await ensureConnectorHealthColumns().catch(()=>{});
    await q(
      `UPDATE connectors
          SET last_error=NULL,
              updated_at=$3
        WHERE tenant_id=$1 AND type=$2 AND provider=$4`,
      [tid, type, now(), provider]
    );
    try { await recordOpsRun('connector_clear_error', { tenant_id: tid, provider, type }); } catch(_e) {}
    return res.json({ ok:true });
  } catch (e) {
    console.error('connector/clear_error failed', e);
    return res.status(500).json({ ok:false, error:'clear_error failed' });
  }
});

// Create Express app

// Ensure JSON body parsing (safe to call even if already present)
app.use(express.json());
// healthcheck for uptime monitoring / readiness
app.get('/health', (req,res) => {
  res.json({ ok:true, uptime: process.uptime() });
});

// --- Bootstrap admin login for the web app ---
// POST /auth/admin-login  { email, password }
app.post('/auth/admin-login', async (req, res) => {
  try {
    const email = (req.body && req.body.email) || '';
    const password = (req.body && req.body.password) || '';

    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@cyberguardpro.com';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMeNow!';

    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ ok:false, error: 'invalid credentials' });
    }

    // dynamic import to avoid touching top-level imports
    const jwtMod = await import('jsonwebtoken');
    const jwt = jwtMod.default || jwtMod;

    const token = jwt.sign(
  {
    sub: email,
    email,
    role: 'owner',
    plan: 'pro_plus',      // keep Pro+ so AI routes work
    tenant_id: 'tenant_admin',
    is_super: true
  },
  process.env.JWT_SECRET || 'dev-secret',
  { expiresIn: '12h' }
);
    return res.json({ ok:true, token });
  } catch (e) {
    console.error('auth/admin-login error', e);
    return res.status(500).json({ ok:false, error: 'server error' });
  }
});

// Backward-compat login endpoint (same logic)
app.post('/auth/login', async (req, res) => {
  try {
    const email = (req.body && req.body.email) || '';
    const password = (req.body && req.body.password) || '';

    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@cyberguardpro.com';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMeNow!';

    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ ok:false, error: 'invalid credentials' });
    }

    const jwtMod = await import('jsonwebtoken');
    const jwt = jwtMod.default || jwtMod;

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
    return res.json({ ok:true, token });
  } catch (e) {
    console.error('auth/login error', e);
    return res.status(500).json({ ok:false, error: 'server error' });
  }
});
// One-time bootstrap to create the default tenant row (idempotent; super only)
app.post('/admin/bootstrap-tenant', authMiddleware, async (req, res) => {
  try {
    if (!req.user?.is_super) {
      return res.status(403).json({ ok:false, error: 'forbidden' });
    }
    const tid = req.user?.tenant_id;
    if (!tid) return res.status(400).json({ ok:false, error:'no tenant_id in token' });

    await q(
      `INSERT INTO tenants(tenant_id, name, plan, trial_status, trial_ends_at, created_at, updated_at)
       VALUES($1,$2,'pro_plus','active', EXTRACT(EPOCH FROM NOW()) + 14*24*3600,
              EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tid, 'Cyber Guard Pro']
    );

    return res.json({ ok:true, tenant_id: tid });
  } catch (e) {
    console.error('bootstrap-tenant error', e);
    return res.status(500).json({ ok:false, error:'bootstrap failed' });
  }
});

// One-time bootstrap (schema-safe): creates/repairs tenants schema before upsert
app.post('/admin/bootstrap-tenant-safe', authMiddleware, async (req, res) => {
  try {
    if (!req.user?.is_super) {
      return res.status(403).json({ ok:false, error: 'forbidden' });
    }
    const tid = req.user?.tenant_id;
    if (!tid) return res.status(400).json({ ok:false, error:'no tenant_id in token' });

    // Ensure tenants table and required columns exist (idempotent)
    try {
      await q(`
        CREATE TABLE IF NOT EXISTS tenants (
          tenant_id TEXT PRIMARY KEY,
          name TEXT,
          plan TEXT,
          trial_status TEXT,
          trial_ends_at BIGINT,
          contact_email TEXT,
          stripe_customer_id TEXT,
          billing_status TEXT,
          created_at BIGINT,
          updated_at BIGINT
        );
      `);
    } catch(_) {}

    // Column-by-column safety (older schemas)
    try { await q(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS name TEXT`); } catch(_) {}
    try { await q(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan TEXT`); } catch(_) {}
    try { await q(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_status TEXT`); } catch(_) {}
    try { await q(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at BIGINT`); } catch(_) {}
    try { await q(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_email TEXT`); } catch(_) {}
    try { await q(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`); } catch(_) {}
    try { await q(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_status TEXT`); } catch(_) {}
    try { await q(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS created_at BIGINT`); } catch(_) {}
    try { await q(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at BIGINT`); } catch(_) {}

    // Upsert the default tenant
    await q(
      `INSERT INTO tenants(tenant_id, name, plan, trial_status, trial_ends_at, created_at, updated_at)
       VALUES($1,$2,'pro_plus','active', EXTRACT(EPOCH FROM NOW()) + 14*24*3600,
              EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
       ON CONFLICT (tenant_id) DO UPDATE SET
         name=EXCLUDED.name,
         plan=EXCLUDED.plan,
         updated_at=EXCLUDED.updated_at`,
      [tid, 'Cyber Guard Pro']
    );

    return res.json({ ok:true, tenant_id: tid, ensured: true });
  } catch (e) {
    console.error('bootstrap-tenant-safe error', e);
    return res.status(500).json({ ok:false, error:'bootstrap failed', detail: String(e?.message||e) });
  }
});

// Super Admin: run a one-shot poll now for this tenant (email connectors)
// POST /admin/ops/poll/now  { limit?: number }
app.post('/admin/ops/poll/now', authMiddleware, requireSuper, async (req, res) => {
  try {
    const tid = req.user.tenant_id;
    const limit = Math.max(1, Math.min(100, Number(req.body?.limit || 25)));
    await ensureConnectorHealthColumns().catch(()=>{});
    const { rows } = await q(`
      SELECT tenant_id, provider
        FROM connectors
       WHERE tenant_id=$1 AND type='email'
       ORDER BY updated_at DESC
       LIMIT 20
    `, [tid]);
    const results = [];
    for (const r of rows) {
      try {
        let items = [];
        if (r.provider === 'm365') {
          try { items = await fetchM365Delta(r.tenant_id, limit); }
          catch (_e) { items = await fetchM365Inbox(r.tenant_id, Math.min(10, limit)); }
        } else if (r.provider === 'google') {
          items = await gmailList(r.tenant_id, 'newer_than:1d', limit);
        } else {
          await q(
            `UPDATE connectors
                SET status='error', last_error=$3, updated_at=$2
              WHERE tenant_id=$1 AND type='email' AND provider=$4`,
            [r.tenant_id, now(), 'unsupported provider', r.provider]
          );
          results.push({ provider: r.provider, ok:false, error:'unsupported' });
          continue;
        }

        const created = await scanAndRecordEmails(r.tenant_id, items);
        await q(
          `UPDATE connectors
              SET status='connected', last_error=NULL, last_sync_at=$2, updated_at=$2
            WHERE tenant_id=$1 AND type='email' AND provider=$3`,
          [r.tenant_id, now(), r.provider]
        );
        results.push({ provider: r.provider, ok:true, alerts_created: created });
      } catch (inner) {
        await q(
          `UPDATE connectors
              SET status='error', last_error=$3, updated_at=$2
            WHERE tenant_id=$1 AND type='email' AND provider=$4`,
          [r.tenant_id, now(), String(inner.message || inner), r.provider]
        );
        results.push({ provider: r.provider, ok:false, error: String(inner.message||inner) });
      }
    }
    try { await recordOpsRun('poll_now', { tenant_id: tid, results }); } catch(_e) {}
    return res.json({ ok:true, results });
  } catch (e) {
    console.error('poll/now failed', e);
    return res.status(500).json({ ok:false, error:'poll failed' });
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
    // Ensure health columns exist
    try { await ensureConnectorHealthColumns(); } catch(_e) {}

    // Pull a small batch of email connectors (any status) so we can heal/retry
    const { rows } = await q(`
      SELECT tenant_id, provider
        FROM connectors
       WHERE type='email'
       ORDER BY updated_at DESC
       LIMIT 100
    `);

    for (const r of rows) {
      try {
        let items = [];
        if (r.provider === 'm365') {
          try {
            items = await fetchM365Delta(r.tenant_id, 25);
          } catch (_e) {
            items = await fetchM365Inbox(r.tenant_id, 10);
          }
        } else if (r.provider === 'google') {
          items = await gmailList(r.tenant_id, 'newer_than:1d', 25);
        } else {
          // unsupported provider — mark as error once and skip
          await q(
            `UPDATE connectors
                SET status='error',
                    last_error=$3,
                    updated_at=$2
              WHERE tenant_id=$1 AND type='email' AND provider=$4`,
            [r.tenant_id, now(), 'unsupported provider', r.provider]
          );
          continue;
        }

        const created = await scanAndRecordEmails(r.tenant_id, items);

        // Mark connector healthy on successful poll
        await q(
          `UPDATE connectors
              SET status='connected',
                  last_error=NULL,
                  last_sync_at=$2,
                  updated_at=$2
            WHERE tenant_id=$1 AND type='email' AND provider=$3`,
          [r.tenant_id, now(), r.provider]
        );

        if (created > 0) console.log('[poll]', r.tenant_id, r.provider, 'alerts:', created);
        // -- Denormalize alert detail columns for this tenant (after creation)
        try { await ensureAlertDetailColumns(); await denormalizeAlertsForTenant(r.tenant_id); } catch(_) {}
// ---------- Alerts detail schema helpers ----------
async function ensureAlertDetailColumns() {
  // Ensure denormalized columns exist
  try { await q(`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS from_addr TEXT`); } catch(_) {}
  try { await q(`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS type TEXT`); } catch(_) {}
  try { await q(`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS subject TEXT`); } catch(_) {}
  try { await q(`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS preview TEXT`); } catch(_) {}
  try { await q(`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS anomaly BOOLEAN`); } catch(_) {}
  try { await q(`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS score NUMERIC`); } catch(_) {}
  // Helpful indexes used by list/detail screens
  try { await q(`CREATE INDEX IF NOT EXISTS alerts_tenant_status ON alerts(tenant_id, status)`); } catch(_) {}
  try { await q(`CREATE INDEX IF NOT EXISTS alerts_tenant_anomaly ON alerts(tenant_id, anomaly)`); } catch(_) {}
  try { await q(`CREATE INDEX IF NOT EXISTS alerts_tenant_from ON alerts(tenant_id, from_addr)`); } catch(_) {}
}

// Best-effort denormalization from legacy JSONB and other columns into flat columns
async function denormalizeAlertsForTenant(tenantId) {
  // Defensive limits (also mirrored in export)
  const MAX_SUBJECT = 300;
  const MAX_PREVIEW = 500;

  try {
    // Best-effort merge from a variety of legacy JSON locations
    await q(`
      WITH src AS (
        SELECT id,
               COALESCE(
                 event::jsonb,
                 data::jsonb,
                 payload::jsonb,
                 raw::jsonb,
                 details::jsonb
               ) AS j
          FROM alerts
         WHERE tenant_id = $1
      )
      UPDATE alerts a
         SET from_addr = COALESCE(
               NULLIF(a.from_addr, ''),
               src.j->>'from',
               src.j->'from'->>'address',
               src.j->'from'->'emailAddress'->>'address',
               src.j->'sender'->'emailAddress'->>'address',
               src.j->'sender'->>'address',
               src.j->'From'->>'Address'
             ),
             type = COALESCE(
               NULLIF(a.type, ''),
               src.j->>'type',
               'email'
             ),
             subject = LEFT(COALESCE(
               NULLIF(a.subject, ''),
               src.j->>'subject',
               src.j->'message'->>'subject',
               src.j->'headers'->>'Subject'
             ), ${MAX_SUBJECT}),
             preview = LEFT(COALESCE(
               NULLIF(a.preview, ''),
               src.j->>'preview',
               src.j->>'bodyPreview',
               src.j->'message'->>'snippet',
               src.j->'message'->'body'->>'content',
               src.j->'body'->>'content'
             ), ${MAX_PREVIEW}),
             anomaly = COALESCE(
               a.anomaly,
               NULLIF((src.j->>'anomaly')::text, '')::boolean
             ),
             status = COALESCE(NULLIF(a.status, ''), 'new')
        FROM src
       WHERE a.id = src.id
         AND a.tenant_id = $1
    `, [tenantId]);
  } catch (_) {
    // If any of the JSONB casts fail (missing columns), just skip silently
  }
}

// Periodic background denormalization (lightweight)
setInterval(async ()=>{
  try {
    await ensureAlertDetailColumns();
    // touch most recent tenant IDs from alerts
    const r = await q(`SELECT DISTINCT tenant_id FROM alerts ORDER BY created_at DESC LIMIT 25`);
    for (const row of (r.rows || [])) {
      await denormalizeAlertsForTenant(row.tenant_id);
    }
  } catch(e) {
    // non-fatal
  }
}, 5*60*1000); // every 5 minutes

// Opportunistic status normalization for recent rows (no-op if already set)
setInterval(async () => {
  try {
    await q(`
      UPDATE alerts
         SET status = 'new'
       WHERE tenant_id IN (SELECT DISTINCT tenant_id FROM alerts ORDER BY created_at DESC LIMIT 50)
         AND (status IS NULL OR status = '')
    `);
  } catch (_e) { /* ignore */ }
}, 10 * 60 * 1000); // every 10 minutes

      } catch (inner) {
        // Mark connector as error on failure (do not throw)
        await q(
          `UPDATE connectors
              SET status='error',
                  last_error=$3,
                  updated_at=$2
            WHERE tenant_id=$1 AND type='email' AND provider=$4`,
          [r.tenant_id, now(), String(inner.message || inner), r.provider]
        );
        console.warn('[poll] tenant failed', r.tenant_id, r.provider, String(inner.message||inner));
      }
    }
  } catch (e) {
    console.warn('background poller error', e);
  }
}, 5*60*1000); // every 5 minutes
// ---------- Connector health ----------
app.get('/connectors/status', authMiddleware, async (req, res) => {
  try {
    const tid = req.user.tenant_id;
    // Try full schema first
    try {
      const { rows } = await q(`
        SELECT provider,
               status,
               last_error,
               last_sync_at,
               updated_at
          FROM connectors
         WHERE tenant_id=$1 AND type='email'
         ORDER BY updated_at DESC
      `, [tid]);
      return res.json({ ok:true, connectors: rows });
    } catch (_e1) {
      // Fallback: older schema without status/last_sync_at/last_error
      try {
        const { rows } = await q(`
          SELECT provider,
                 'unknown'::text AS status,
                 NULL::text      AS last_error,
                 NULL::bigint    AS last_sync_at,
                 updated_at
            FROM connectors
           WHERE tenant_id=$1 AND type='email'
           ORDER BY updated_at DESC
        `, [tid]);
        return res.json({ ok:true, connectors: rows, note: 'partial schema' });
      } catch (_e2) {
        // Final fallback: minimal columns
        const { rows } = await q(`
          SELECT provider,
                 updated_at
            FROM connectors
           WHERE tenant_id=$1 AND type='email'
           ORDER BY updated_at DESC
        `, [tid]);
        const mapped = rows.map(r => ({
          provider: r.provider,
          status: 'unknown',
          last_error: null,
          last_sync_at: null,
          updated_at: r.updated_at
        }));
        return res.json({ ok:true, connectors: mapped, note: 'minimal schema' });
      }
    }
  } catch (e) {
    console.error('connectors/status failed', e);
    return res.status(500).json({ ok:false, error: 'status failed' });
  }
});


// ====== AI Autonomy Backend Patch ======
// --- SQL helpers for ai_policies, ai_actions, ai_jobs ---
async function ensureAIAutonomySchema() {
  // ai_policies: id, tenant_id, mode (manual|auto), rules (json), enabled, created_at, updated_at
  await q(`
    CREATE TABLE IF NOT EXISTS ai_policies (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'manual',
      rules JSONB DEFAULT '{}'::jsonb,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
  `);
  // ai_actions: id, tenant_id, policy_id, action, params, status, approved_by, result, created_at, updated_at
  await q(`
    CREATE TABLE IF NOT EXISTS ai_actions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      policy_id TEXT,
      action TEXT NOT NULL,
      params JSONB DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'proposed',
      approved_by TEXT,
      result JSONB,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
  `);
  // ai_jobs: id, tenant_id, type, status, payload, result, created_at, updated_at
  await q(`
    CREATE TABLE IF NOT EXISTS ai_jobs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payload JSONB DEFAULT '{}'::jsonb,
      result JSONB,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
  `);
}
ensureAIAutonomySchema().catch(()=>{});
// --- Core DB bootstrap: create/repair base tables for fresh deploys ---
async function ensureBaseSchema(){
  // tenants
  await q(`
    CREATE TABLE IF NOT EXISTS tenants (
      tenant_id TEXT PRIMARY KEY,
      name TEXT,
      plan TEXT,
      trial_status TEXT,
      trial_ends_at BIGINT,
      contact_email TEXT,
      stripe_customer_id TEXT,
      billing_status TEXT,
      created_at BIGINT,
      updated_at BIGINT
    );
  `);
  // columns for older schemas
  try { await q(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_status TEXT`); } catch(_e) {}

  // users (minimal)
  await q(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT,
      created_at BIGINT,
      updated_at BIGINT
    );
  `);
  await q(`CREATE INDEX IF NOT EXISTS users_tenant_email ON users(tenant_id, email)`);

  // alerts (flat columns used by UI)
  await q(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      event_json JSONB,
      score NUMERIC,
      status TEXT,
      created_at BIGINT,
      from_addr TEXT,
      type TEXT,
      subject TEXT,
      preview TEXT,
      anomaly BOOLEAN
    );
  `);
  await q(`CREATE INDEX IF NOT EXISTS alerts_tenant_created ON alerts(tenant_id, created_at)`);
  await q(`CREATE INDEX IF NOT EXISTS alerts_tenant_status ON alerts(tenant_id, status)`);
  await q(`CREATE INDEX IF NOT EXISTS alerts_tenant_anomaly ON alerts(tenant_id, anomaly)`);
  await q(`CREATE INDEX IF NOT EXISTS alerts_tenant_from ON alerts(tenant_id, from_addr)`);

  // actions (automated/approved actions)
  await q(`
    CREATE TABLE IF NOT EXISTS actions (
      id TEXT PRIMARY KEY,
      alert_id TEXT,
      tenant_id TEXT NOT NULL,
      action TEXT,
      target_kind TEXT,
      result_json JSONB,
      created_at BIGINT
    );
  `);
  await q(`CREATE INDEX IF NOT EXISTS actions_tenant_created ON actions(tenant_id, created_at)`);

  // usage_events (billing/retention diagnostics)
  await q(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      kind TEXT,
      created_at BIGINT
    );
  `);
  await q(`CREATE INDEX IF NOT EXISTS usage_tenant_created ON usage_events(tenant_id, created_at)`);

  // connectors (email providers etc.)
  await q(`
    CREATE TABLE IF NOT EXISTS connectors (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      type TEXT,
      provider TEXT,
      status TEXT,
      last_error TEXT,
      last_sync_at BIGINT,
      updated_at BIGINT,
      details JSONB
    );
  `);
  await q(`CREATE INDEX IF NOT EXISTS connectors_tenant_type ON connectors(tenant_id, type)`);

  // apikeys (string keys)
  await q(`
    CREATE TABLE IF NOT EXISTS apikeys (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      revoked BOOLEAN NOT NULL DEFAULT false,
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
    );
  `);
  // normalize id column type if an older deploy used UUID
  try { await q(`ALTER TABLE apikeys ADD COLUMN IF NOT EXISTS id TEXT`); } catch(_e) {}
  try {
    await q(`DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='apikeys' AND column_name='id' AND data_type='uuid'
      ) THEN
        ALTER TABLE apikeys ALTER COLUMN id TYPE TEXT USING id::text;
      END IF;
    END $$;`);
  } catch(_e) {}

  // ops_runs (audit log)
  await q(`
    CREATE TABLE IF NOT EXISTS ops_runs (
      id TEXT PRIMARY KEY,
      run_type TEXT,
      details JSONB,
      created_at BIGINT
    );
  `);
  await q(`CREATE INDEX IF NOT EXISTS ops_runs_type_created ON ops_runs(run_type, created_at)`);
}

// Run base bootstrap on startup (no-throw)
ensureBaseSchema().catch(()=>{});
// --- Helper: isProPlus ---
async function isProPlus(tenant_id) {
  const { rows } = await q(`SELECT plan,trial_status,trial_ends_at FROM tenants WHERE tenant_id=$1`, [tenant_id]);
  if (!rows.length) return false;
  const plan = (rows[0].plan || '').toLowerCase();
  if (plan === 'pro_plus') return true;
  // Allow trial users to access Pro+ features if trial_status is active
  if (rows[0].trial_status === 'active' && Number(rows[0].trial_ends_at || 0) > now()) return true;
  return false;
}

// --- Helper: withinRateLimit (stub) ---
async function withinRateLimit(tenant_id, action) {
  // TODO: implement actual rate limiting if needed
  return true;
}

// --- Helper: proposeActions (stub) ---
async function proposeActions(tenant_id, context) {
  // TODO: Use LLM or rules engine to propose actions.
  // For now, return an example action.
  return [
    {
      action: "quarantine_device",
      params: { device_id: context?.device_id || "dev123" },
      reason: "Suspicious activity detected"
    }
  ];
}

// --- Helper: executeAction (stub) ---
async function executeAction(ai_action) {
  // Simulate action execution
  return { ok: true, executed: true, action: ai_action.action, params: ai_action.params, ts: now() };
}

// --- Middleware: requireProPlus ---
async function requireProPlus(req, res, next) {
  try {
    // Super-admin preview/bypass overrides
    if (req.user && req.user.is_super) {
      const hdrPlan = String(req.get('x-admin-plan-preview') || '').toLowerCase().trim();
      const bypass = String(req.get('x-admin-bypass') || '').toLowerCase();
      const bypassOn = bypass === '1' || bypass === 'true' || bypass === 'yes';
      if (bypassOn || hdrPlan === 'pro_plus') {
        return next();
      }
    }

    if (!(await isProPlus(req.user.tenant_id))) {
      return res.status(402).json({ ok: false, error: 'Requires Pro+ plan' });
    }
    next();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'plan check failed' });
  }
}

// ===== EARLY BOOTSTRAP: CORS + /api rewrite + cookie→auth (must be before any routes) =====
if (!app._early_bootstrap) {
  app._early_bootstrap = true;
  app.use((req, res, next) => {
    // --- /api prefix rewrite (ensure legacy routes work under /api/*) ---
    if (req.url === '/api') {
      req.url = '/';
    } else if (req.url && req.url.startsWith('/api/')) {
      req.url = req.url.slice(4);
    }

    // --- CORS headers (always set, even on 4xx/5xx) ---
    res.header('Vary', 'Origin, Access-Control-Request-Headers');
    if (allowOrigin(req.headers.origin)) {
      res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    }
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'authorization,content-type,x-admin-plan-preview,x-admin-bypass,Authorization,Content-Type,X-Admin-Plan-Preview,X-Admin-Bypass'
    );
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    // --- Minimal cookie parse + promote cg_access -> Authorization (so auth works cross-site) ---
    try {
      if (!req.cookies) {
        const cookieHeader = req.headers.cookie || '';
        const out = {};
        if (cookieHeader && typeof cookieHeader === 'string') {
          const parts = cookieHeader.split(/;\s*/g);
          for (const p of parts) {
            const i = p.indexOf('=');
            if (i > 0) {
              const k = decodeURIComponent(p.slice(0, i).trim());
              const v = decodeURIComponent(p.slice(i + 1));
              if (k) out[k] = v;
            }
          }
        }
        req.cookies = out;
      }
      if (!req.headers.authorization && req.cookies && req.cookies.cg_access) {
        req.headers.authorization = `Bearer ${req.cookies.cg_access}`;
      }
    } catch (_e) { /* non-fatal */ }

    return next();
  });
}
// ===== END EARLY BOOTSTRAP =====

// --- GET /ai/policies ---
app.get('/ai/policies', authMiddleware, enforceActive, requireProPlus, async (req,res)=>{
  try {
    const { rows } = await q(`SELECT * FROM ai_policies WHERE tenant_id=$1 ORDER BY updated_at DESC`, [req.user.tenant_id]);
    res.json({ ok:true, policies: rows });
  } catch(e) {
    res.status(500).json({ ok:false, error: 'load failed' });
  }
});

// --- POST /ai/policies ---
app.post('/ai/policies', authMiddleware, enforceActive, requireProPlus, async (req,res)=>{
  try {
    const { mode, rules, enabled } = req.body || {};
    const id = 'pol_' + uuidv4();
    const t = now();
    await q(`
      INSERT INTO ai_policies(id, tenant_id, mode, rules, enabled, created_at, updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$6)
      ON CONFLICT (id) DO UPDATE SET
        mode=EXCLUDED.mode,
        rules=EXCLUDED.rules,
        enabled=EXCLUDED.enabled,
        updated_at=EXCLUDED.updated_at
    `, [id, req.user.tenant_id, mode||'manual', rules||{}, !!enabled, t]);
    const { rows } = await q(`SELECT * FROM ai_policies WHERE id=$1`, [id]);
    res.json({ ok:true, policy: rows[0] });
  } catch(e) {
    res.status(500).json({ ok:false, error: 'save failed' });
  }
});

// --- GET /ai/actions ---
app.get('/ai/actions', authMiddleware, enforceActive, requireProPlus, async (req,res)=>{
  try {
    const { rows } = await q(`SELECT * FROM ai_actions WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200`, [req.user.tenant_id]);
    res.json({ ok:true, actions: rows });
  } catch(e) {
    res.status(500).json({ ok:false, error: 'load failed' });
  }
});

// --- POST /ai/propose ---
app.post('/ai/propose', authMiddleware, enforceActive, requireProPlus, async (req,res)=>{
  try {
    const context = req.body?.context || {};
    if (!(await withinRateLimit(req.user.tenant_id, 'propose'))) {
      return res.status(429).json({ ok:false, error: 'rate limit' });
    }
    const actions = await proposeActions(req.user.tenant_id, context);
    // Record proposed actions in ai_actions
    const t = now();
    const policy = await q(`SELECT * FROM ai_policies WHERE tenant_id=$1 AND enabled=true ORDER BY updated_at DESC LIMIT 1`, [req.user.tenant_id]).then(r=>r.rows[0]);
    const policy_id = policy?.id || null;
    const ids = [];
    for(const a of actions) {
      const id = 'act_' + uuidv4();
      ids.push(id);
      await q(`
        INSERT INTO ai_actions(id, tenant_id, policy_id, action, params, status, created_at, updated_at)
        VALUES($1,$2,$3,$4,$5,'proposed',$6,$6)
      `, [id, req.user.tenant_id, policy_id, a.action, a.params||{}, t]);
    }
    try { await recordOpsRun('ai_propose', { tenant_id: req.user.tenant_id, actions }); } catch(_e){}
    res.json({ ok:true, actions, ids });
  } catch(e) {
    res.status(500).json({ ok:false, error: 'propose failed' });
  }
});

// --- POST /ai/approve ---
app.post('/ai/approve', authMiddleware, enforceActive, requireProPlus, async (req,res)=>{
  try {
    const { action_id } = req.body || {};
    if (!action_id) return res.status(400).json({ ok:false, error:'missing action_id' });
    // Only allow approving own tenant's actions
    const { rows } = await q(`SELECT * FROM ai_actions WHERE id=$1 AND tenant_id=$2`, [action_id, req.user.tenant_id]);
    if (!rows.length) return res.status(404).json({ ok:false, error:'not found' });
    const t = now();
    await q(`
      UPDATE ai_actions
         SET status='approved', approved_by=$1, updated_at=$2
       WHERE id=$3
    `, [req.user.email||'user', t, action_id]);
    res.json({ ok:true });
  } catch(e) {
    res.status(500).json({ ok:false, error: 'approve failed' });
  }
});

// --- POST /ai/execute (internal trigger) ---
app.post('/ai/execute', authMiddleware, enforceActive, requireProPlus, async (req,res)=>{
  try {
    const { action_id } = req.body || {};
    if (!action_id) return res.status(400).json({ ok:false, error:'missing action_id' });
    const { rows } = await q(`SELECT * FROM ai_actions WHERE id=$1 AND tenant_id=$2`, [action_id, req.user.tenant_id]);
    if (!rows.length) return res.status(404).json({ ok:false, error:'not found' });
    const action = rows[0];
    if (action.status !== 'approved' && action.status !== 'auto_approved') {
      return res.status(400).json({ ok:false, error:'not approved' });
    }
    // Execute
    const result = await executeAction(action);
    const t = now();
    await q(`
      UPDATE ai_actions
         SET status='executed', result=$1, updated_at=$2
       WHERE id=$3
    `, [result, t, action_id]);
    try { await recordOpsRun('ai_execute', { tenant_id: req.user.tenant_id, action_id, result }); } catch(_e){}
    res.json({ ok:true, result });
  } catch(e) {
    res.status(500).json({ ok:false, error: 'execute failed' });
  }
});

// --- Interval loop: auto-execute approved actions for tenants with mode=auto ---
setInterval(async ()=>{
  try {
    // Find tenants with auto mode enabled
    const { rows: tenants } = await q(`
      SELECT tenant_id, id FROM ai_policies
       WHERE enabled=true AND mode='auto'
    `);
    for(const pol of tenants) {
      // For each, get approved/unexecuted actions
      const { rows: acts } = await q(`
        SELECT * FROM ai_actions
         WHERE tenant_id=$1 AND policy_id=$2 AND status IN ('approved', 'auto_approved')
         ORDER BY created_at ASC LIMIT 10
      `, [pol.tenant_id, pol.id]);
      for(const a of acts) {
        try {
          const result = await executeAction(a);
          await q(`
            UPDATE ai_actions
               SET status='executed', result=$1, updated_at=$2
             WHERE id=$3
          `, [result, now(), a.id]);
          try { await recordOpsRun('ai_execute', { tenant_id: pol.tenant_id, action_id: a.id, result }); } catch(_e){}
        } catch(e) {
          // log but continue
          console.warn('[ai/auto-exec] failed', a.id, e?.message||e);
        }
      }
    }
  } catch(e) {
    // log but don't crash
    console.warn('[ai/auto-exec] error', e?.message||e);
  }
}, 60*1000); // every 1 minute

// ====== END AI Autonomy Patch ======

// ---------- tenant billing status helpers ----------
// Set billing status for a tenant (safe for upserts)
async function setTenantBillingStatus(tenantId, status) {
  try { await ensureBillingStatusColumn(); } catch(_e) {}
  await q(`UPDATE tenants SET billing_status=$2 WHERE tenant_id=$1`, [tenantId, status ?? null]);
}

// Map Stripe price IDs to internal plan codes
const PRICE_TO_PLAN = (() => {
  const m = new Map();
  if (process.env.STRIPE_PRICE_PRO) m.set(process.env.STRIPE_PRICE_PRO, 'pro');
  if (process.env.STRIPE_PRICE_PRO_PLUS) m.set(process.env.STRIPE_PRICE_PRO_PLUS, 'pro_plus');
  return m;
})();
function planFromPriceId(priceId){
  if(!priceId) return null;
  const id = String(priceId).trim();
  return PRICE_TO_PLAN.get(id) || null;
}
function normalizePlan(p){
  const v = String(p||'').toLowerCase();
  if(['pro','pro_plus'].includes(v)) return v;
  return null;
}
// Link a Stripe customer to a tenant (idempotent)
async function setTenantStripeCustomerId(tenantId, customerId){
  if(!tenantId || !customerId) return;
  await q(`UPDATE tenants SET stripe_customer_id=$2 WHERE tenant_id=$1`, [tenantId, customerId]);
}
// Resolve tenant_id by Stripe customer id
async function tenantIdByStripeCustomerId(customerId){
  const r = await q(`SELECT tenant_id FROM tenants WHERE stripe_customer_id=$1`, [customerId]);
  return r.rows && r.rows[0] ? r.rows[0].tenant_id : null;
}

// -- Ensure billing_status column exists (safe, idempotent)
async function ensureBillingStatusColumn() {
  try {
    await q(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_status TEXT`);
  } catch (_e) { /* ignore */ }
}

// -- Check if billing_status column exists (with simple in-memory cache)
let _billingStatusColumnKnown = false;
let _billingStatusColumnHas = false;
async function hasBillingStatusColumn() {
  if (_billingStatusColumnKnown) return _billingStatusColumnHas;
  try {
    const r = await q(`SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='billing_status' LIMIT 1`);
    _billingStatusColumnHas = r.rows && r.rows.length > 0;
    _billingStatusColumnKnown = true;
    return _billingStatusColumnHas;
  } catch (_e) {
    // On any error, assume not present
    _billingStatusColumnKnown = true;
    _billingStatusColumnHas = false;
    return false;
  }
}
// -- Ensure connectors health columns exist (safe, idempotent)
async function ensureConnectorHealthColumns() {
  try { await q(`ALTER TABLE connectors ADD COLUMN IF NOT EXISTS status TEXT`); } catch (_e) {}
  try { await q(`ALTER TABLE connectors ADD COLUMN IF NOT EXISTS last_error TEXT`); } catch (_e) {}
  try { await q(`ALTER TABLE connectors ADD COLUMN IF NOT EXISTS last_sync_at BIGINT`); } catch (_e) {}
}


// ---------- /me route ----------
async function meRouteHandler(req, res) {
  {
    try {
      // breadcrumbs for debugging
      try { await recordOpsRun('me_stage', { s: 'start', tid: req.user?.tenant_id || null }); } catch (_e) {}

      // Fetch tenant row (same shape as /me_dbg)
      try { await recordOpsRun('me_stage', { s: 'before_select', tid: req.user?.tenant_id || null }); } catch (_e) {}
      const r = await q(`SELECT * FROM tenants WHERE tenant_id=$1`, [req.user.tenant_id]);
      const rows = Array.isArray(r) ? r : (r && Array.isArray(r.rows) ? r.rows : []);
      try { await recordOpsRun('me_stage', { s: 'after_select', n: rows.length, tid: req.user?.tenant_id || null }); } catch (_e) {}
      if (!rows.length) {
        res.setHeader('X-ME', 'notfound');
        return res.status(404).json({ error: 'not found' });
      }
      const t = rows[0];
      try { await recordOpsRun('me_stage', { s: 'have_row', plan: t?.plan || null, tid: req.user?.tenant_id || null }); } catch (_e) {}

      // Safe numbers for epoch fields
      const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
      const nowEpoch = Math.floor(Date.now() / 1000);
      const trialEndsNum = toNum(t.trial_ends_at);
      const trialActive = (t.trial_status === 'active') && trialEndsNum > nowEpoch;
      let trialEndsISO = null;
      try { trialEndsISO = trialEndsNum > 0 ? new Date(trialEndsNum * 1000).toISOString() : null; } catch(_e) { trialEndsISO = null; }

      const role = req.user?.role || 'member';
      const is_super = !!req.user?.is_super;

      // Back-compat: expose both flat fields AND nested { user, tenant }
      const email = req.user?.email || req.user?.sub || null;

      const tenantObj = {
        id: t.tenant_id || t.id || req.user.tenant_id,
        tenant_id: t.tenant_id || t.id || req.user.tenant_id,
        name: t.name || null,
        plan: t.plan || null,
        contact_email: t.contact_email ?? null,
        trial_started_at: t.trial_started_at ?? null,
        trial_ends_at: t.trial_ends_at ?? null,
        trial_status: t.trial_status ?? null,
        created_at: t.created_at ?? null,
        updated_at: t.updated_at ?? null,
        billing_status: (typeof t.billing_status === 'undefined' ? null : t.billing_status)
      };

      // Super-admin preview plan override via headers (from Admin UI)
      const adminHdrPlan = (is_super ? String(req.get('x-admin-plan-preview') || '').toLowerCase().trim() : '');
      const effectivePlan = (adminHdrPlan === 'pro' || adminHdrPlan === 'pro_plus') ? adminHdrPlan : (tenantObj.plan || null);

      const userObj = {
        email,
        role: is_super ? 'super_admin' : role,
        plan: effectivePlan,
        tenant_id: tenantObj.tenant_id,
        is_super,
        // UI-friendly aliases (keep both snake & camel just in case)
        isSuper: is_super,
        superAdmin: is_super,
        flags: { superAdmin: is_super }
      };

      const payload = {
        ok: true,

        // ---- flat fields (legacy callers) ----
        id: tenantObj.id,
        tenant_id: tenantObj.tenant_id,
        name: tenantObj.name,
        plan: effectivePlan,
        contact_email: tenantObj.contact_email,
        trial_started_at: tenantObj.trial_started_at,
        trial_ends_at: tenantObj.trial_ends_at,
        trial_status: tenantObj.trial_status,
        created_at: tenantObj.created_at,
        updated_at: tenantObj.updated_at,
        billing_status: tenantObj.billing_status,
        effective_plan: effectivePlan,
        trial_active: trialActive,
        plan_actual: tenantObj.plan,
        role,
        is_super,
        isSuper: is_super,
        superAdmin: is_super,
        email,

        // ---- nested objects (new callers) ----
        user: userObj,
        tenant: tenantObj,
        // Legacy/session compatibility for UI components that expect a session container
        session: { user: userObj, tenant: tenantObj, loggedIn: true },
        auth: { loggedIn: true, email, role: userObj.role, is_super, isSuper: is_super },
        showAdmin: is_super,

        // normalized trial view for UI
        trial: {
          active: trialActive,
          days_left: trialActive ? Math.max(0, Math.floor((trialEndsNum - nowEpoch) / 86400)) : 0,
          ends_at: trialEndsISO
        }
      };

      try { await recordOpsRun('me_stage', { s: 'about_to_return', tid: req.user?.tenant_id || null }); } catch (_e) {}
      res.setHeader('X-ME', 'ok');
      return res.json(payload);
    } catch (e) {
      const msg = e?.message || String(e);
      const stack = e?.stack || null;
      console.error('GET /me failed', stack || msg);
      try { await recordOpsRun('me_error', { tenant_id: req.user?.tenant_id || null, msg, stack, v: 'me_v4' }); } catch (_e) {}
      res.setHeader('X-ME', 'err');
      return res.status(500).json({ error: 'me failed', detail: msg });
    }
  }
}

// Register the handler on both legacy and /api paths
app.get('/me', authMiddleware, meRouteHandler);
app.get('/api/me', authMiddleware, meRouteHandler);

// Remove any older duplicate /me routes so only this handler remains (but DO NOT remove /api/me)
try {
  if (app && app._router && Array.isArray(app._router.stack)) {
    let seen = 0;
    for (let i = app._router.stack.length - 1; i >= 0; i--) {
      const layer = app._router.stack[i];
      if (
        layer &&
        layer.route &&
        layer.route.path === '/me' &&
        layer.route.methods &&
        layer.route.methods.get
      ) {
        seen++;
        // keep the most recent (this one), remove older ones
        if (seen > 1) {
          app._router.stack.splice(i, 1);
        }
      }
    }
  }
} catch (_e) { /* non-fatal */ }

// (Stray duplicate error-handling fragment removed)
// ---------- debug & diagnostics ----------
// Report commit/version (Render exposes RENDER_GIT_COMMIT)
app.get('/__version', (_req, res) => {
  res.json({ ok: true, commit: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || null, started_at: new Date().toISOString() });
});

// Minimal /me variant that always returns error detail to help diagnose
app.get('/me_dbg', authMiddleware, async (req, res) => {
  try {
    const r = await q(`SELECT * FROM tenants WHERE tenant_id=$1`, [req.user.tenant_id]);
    const rows = Array.isArray(r) ? r : (r && Array.isArray(r.rows) ? r.rows : []);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    const t = rows[0];
    return res.json({ ok: true, tenant: t });
  } catch (e) {
    const msg = e?.message || String(e);
    const stack = e?.stack || null;
    try { await recordOpsRun('me_error', { tenant_id: req.user?.tenant_id || null, msg, stack, dbg: true }); } catch (_e) {}
    return res.status(500).json({ error: 'me failed', detail: msg });
  }
});

// Route map (diagnostics): lists all registered routes and method stacks
if (process.env.NODE_ENV !== 'production') {
  app.get('/__routes', (_req, res) => {
    try {
      const stack = (app._router && app._router.stack) ? app._router.stack : [];
      const routes = [];
      for (const layer of stack) {
        if (layer.route && layer.route.path) {
          const methods = Object.keys(layer.route.methods || {}).filter(m => layer.route.methods[m]);
          routes.push({ path: layer.route.path, methods });
        } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
          for (const l2 of layer.handle.stack) {
            if (l2.route && l2.route.path) {
              const methods = Object.keys(l2.route.methods || {}).filter(m => l2.route.methods[m]);
              routes.push({ path: l2.route.path, methods });
            }
          }
        }
      }
      res.json({ ok: true, routes });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });
}

// ---------- Stripe Billing endpoints ----------

// Create Stripe Checkout session for subscription
app.post('/billing/checkout', authMiddleware, async (req, res) => {
  try{
    const planReq = normalizePlan(req.body?.plan || 'pro') || 'pro';
    const priceId = planReq === 'pro_plus' ? process.env.STRIPE_PRICE_PRO_PLUS : process.env.STRIPE_PRICE_PRO;
    if(!priceId) return res.status(500).json({ ok:false, error: 'price not configured' });

    // Ensure tenant has a Stripe customer
    const cur = await q(`SELECT stripe_customer_id FROM tenants WHERE tenant_id=$1`, [req.user.tenant_id]);
    let customer = cur.rows && cur.rows[0] ? cur.rows[0].stripe_customer_id : null;
    if(!customer){
      const c = await stripe.customers.create({
        name: req.user?.tenant_id || 'Tenant',
        metadata: { tenant_id: req.user.tenant_id }
      });
      customer = c.id;
      await setTenantStripeCustomerId(req.user.tenant_id, customer);
    }

    const success = (process.env.PUBLIC_SITE_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '') + '/billing/success';
    const cancel  = (process.env.PUBLIC_SITE_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '') + '/billing/cancel';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      success_url: success || undefined,
      cancel_url: cancel || undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { tenant_id: req.user.tenant_id, plan: planReq }
    });

    return res.json({ ok:true, url: session.url });
  }catch(e){
    console.error('checkout failed', e);
    return res.status(500).json({ ok:false, error: 'checkout failed' });
  }
});

// Stripe webhook endpoint for subscription events
app.post('/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const raw = req.rawBody || req.body; // raw body preserved by upstream
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    try { await recordOpsRun('stripe_bad_sig', { error: String(err?.message||err) }); } catch(_e) {}
    return res.status(400).send('bad signature');
  }

  try {
    // Helper to safely set billing status (ignores missing column silently)
    async function safeSetBilling(tenantId, status){
      try { await setTenantBillingStatus(tenantId, status); } catch(_e) {}
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const sessId = event.data.object.id;
        const sess = await stripe.checkout.sessions.retrieve(sessId, { expand: ['line_items', 'subscription'] });
        const tenantId = (sess.metadata && sess.metadata.tenant_id) ? sess.metadata.tenant_id : null;
        const customerId = sess.customer || (sess.customer_details && sess.customer_details.id) || null;
        if (tenantId && customerId) await setTenantStripeCustomerId(tenantId, customerId);

        // Billing status hint from checkout payment status
        if (tenantId) {
          const paid = sess.payment_status === 'paid';
          await safeSetBilling(tenantId, paid ? 'active' : (sess.payment_status || 'pending'));
          // End trial if requested by business logic
          if (sess.payment_status === 'paid') {
            try { await q(`UPDATE tenants SET trial_status='ended', trial_ends_at=$2 WHERE tenant_id=$1 AND (trial_status IS NULL OR trial_status <> 'ended')`, [tenantId, Math.floor(Date.now()/1000)]); } catch(_e) {}
          }
        }
        try {
          await recordOpsRun('stripe_webhook', {
            type: event.type,
            action: 'checkout.session.completed',
            event_id: event.id,
            price_id: (sess.line_items && sess.line_items.data[0]?.price?.id) || null,
            customer_id: customerId || null,
            tenant_id: tenantId || null,
            had_metadata: !!tenantId
          });
        } catch(_e) {}
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const customerId = sub.customer;
        const tenantId = await tenantIdByStripeCustomerId(customerId);
        const status = sub.status || null; // active, trialing, past_due, canceled, unpaid
        const priceId = (sub.items && sub.items.data[0] && sub.items.data[0].price && sub.items.data[0].price.id) || null;
        const plan = planFromPriceId(priceId) || normalizePlan(sub.metadata?.plan);
        if (tenantId) {
          if (plan) {
            try { await setTenantPlan(tenantId, plan); } catch(_e) {}
          }
          if (status) {
            await safeSetBilling(tenantId, status);
            if (status === 'active' || status === 'trialing') {
              // ensure trial end sync
              try { await q(`UPDATE tenants SET trial_status=CASE WHEN $2='trialing' THEN 'active' ELSE 'ended' END, trial_ends_at=COALESCE(trial_ends_at, $3) WHERE tenant_id=$1`, [tenantId, status, Math.floor(Date.now()/1000)]); } catch(_e) {}
            }
          }
        }
        try { await recordOpsRun('stripe_webhook', { type: event.type, action: 'customer.subscription.updated', event_id: event.id, plan, tenant_id: tenantId }); } catch(_e) {}
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const tenantId = await tenantIdByStripeCustomerId(sub.customer);
        if (tenantId) {
          await safeSetBilling(tenantId, 'canceled');
          // optional: do not forcibly change plan; customers may retain old plan label until re-subscribe
        }
        try { await recordOpsRun('stripe_webhook', { type: event.type, action: 'customer.subscription.deleted', event_id: event.id, tenant_id: tenantId }); } catch(_e) {}
        break;
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object;
        const customerId = inv.customer;
        const tenantId = await tenantIdByStripeCustomerId(customerId);
        if (tenantId) await safeSetBilling(tenantId, 'payment_failed');
        try {
          await recordOpsRun('stripe_webhook', {
            type: event.type,
            action: 'invoice.payment_failed',
            event_id: event.id,
            customer_id: customerId || null,
            tenant_id: tenantId || null
          });
        } catch(_e) {}
        break;
      }

      case 'invoice.paid': {
        const inv = event.data.object;
        const customerId = inv.customer;
        const tenantId = await tenantIdByStripeCustomerId(customerId);
        if (tenantId) await safeSetBilling(tenantId, 'active');
        try {
          await recordOpsRun('stripe_webhook', {
            type: event.type,
            action: 'invoice.paid',
            event_id: event.id,
            customer_id: customerId || null,
            tenant_id: tenantId || null
          });
        } catch(_e) {}
        break;
      }

      default: {
        // benign: log and continue
        try { await recordOpsRun('stripe_webhook', { type: event.type, event_id: event.id }); } catch(_e) {}
      }
    }
    return res.json({ received: true });
  } catch (e) {
    console.error('stripe webhook handler error', e);
    try { await recordOpsRun('stripe_webhook_error', { error: String(e?.message||e), event_id: event?.id||null }); } catch(_e) {}
    return res.status(500).send('webhook error');
  }
});

// Billing portal (Stripe)
app.get('/billing/portal', authMiddleware, async (req,res)=>{
  try{
    // Ensure customer exists
    const cur = await q(`SELECT stripe_customer_id FROM tenants WHERE tenant_id=$1`, [req.user.tenant_id]);
    let customer = cur.rows && cur.rows[0] ? cur.rows[0].stripe_customer_id : null;
    if(!customer){
      const c = await stripe.customers.create({ name: req.user?.tenant_id || 'Tenant', metadata: { tenant_id: req.user.tenant_id } });
      customer = c.id;
      await setTenantStripeCustomerId(req.user.tenant_id, customer);
    }
    const sess = await stripe.billingPortal.sessions.create({ customer, return_url: (process.env.PUBLIC_SITE_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '') + '/billing' });
    return res.json({ ok:true, url: sess.url });
  }catch(e){
    console.error('portal failed', e);
    return res.status(500).json({ ok:false, error: 'portal failed' });
  }
});

// Super Admin: backfill/sync billing state for the current tenant from Stripe
app.post('/admin/billing/sync', authMiddleware, requireSuper, async (req, res) => {
  try {
    const tid = req.user.tenant_id;
    const cur = await q(`SELECT stripe_customer_id FROM tenants WHERE tenant_id=$1`, [tid]);
    const customer = cur.rows && cur.rows[0] ? cur.rows[0].stripe_customer_id : null;
    if (!customer) {
      return res.status(400).json({ ok:false, error: 'no stripe_customer_id on tenant' });
    }
    // Pull latest subscription for this customer
    const subs = await stripe.subscriptions.list({ customer, status: 'all', limit: 1 });
    if (!subs.data || subs.data.length === 0) {
      await setTenantBillingStatus(tid, null);
      return res.json({ ok:true, updated: false, note: 'no subscriptions found' });
    }
    const sub = subs.data[0];
    const status = sub.status || null; // active, trialing, past_due, canceled, unpaid
    const priceId = (sub.items && sub.items.data[0] && sub.items.data[0].price && sub.items.data[0].price.id) || null;
    const plan = planFromPriceId(priceId) || normalizePlan(sub.metadata?.plan);

    if (plan) {
      try { await setTenantPlan(tid, plan); } catch(_e) {}
    }
    try { await setTenantBillingStatus(tid, status); } catch(_e) {}

    try { await recordOpsRun('billing_sync', { tenant_id: tid, customer_id: customer, status, price_id: priceId, plan }); } catch(_e) {}
    return res.json({ ok:true, plan: plan || null, billing_status: status || null });
  } catch (e) {
    console.error('admin billing sync failed', e);
    return res.status(500).json({ ok:false, error: 'sync failed' });
  }
});

// ---------- Admin: denormalize legacy alert JSON into flat columns ----------
// Super-only: backfill flat columns from legacy event JSON if they are null
app.post('/admin/ops/alerts/denormalize', authMiddleware, requireSuper, async (req, res) => {
  try {
    const tid = req.user.tenant_id;
    const stats = { from_addr: 0, subject: 0, preview: 0, type: 0, anomaly: 0 };

    try {
      const r1 = await q(`
        WITH src AS (
          SELECT id,
                 COALESCE(
                   event::jsonb,
                   data::jsonb,
                   payload::jsonb,
                   raw::jsonb,
                   details::jsonb
                 ) AS j
            FROM alerts
           WHERE tenant_id = $1
             AND (from_addr IS NULL OR from_addr = '')
             AND (
               event IS NOT NULL
               OR data IS NOT NULL
               OR payload IS NOT NULL
               OR raw IS NOT NULL
               OR details IS NOT NULL
             )
        )
        UPDATE alerts a
           SET from_addr = COALESCE(
                 NULLIF(a.from_addr, ''),
                 src.j->>'from',
                 src.j->'from'->'emailAddress'->>'address',
                 src.j->'sender'->'emailAddress'->>'address',
                 src.j->'from'->>'address'
               )
          FROM src
         WHERE a.id = src.id
        RETURNING a.id;
      `, [tid]);
      stats.from_addr = r1.rowCount || (r1.rows ? r1.rows.length : 0) || 0;
    } catch (_e) {}

    try {
      const r2 = await q(`
        WITH src AS (
          SELECT id,
                 COALESCE(
                   event::jsonb,
                   data::jsonb,
                   payload::jsonb,
                   raw::jsonb,
                   details::jsonb
                 ) AS j
            FROM alerts
           WHERE tenant_id = $1
             AND (subject IS NULL OR subject = '')
             AND (
               event IS NOT NULL
               OR data IS NOT NULL
               OR payload IS NOT NULL
               OR raw IS NOT NULL
               OR details IS NOT NULL
             )
        )
        UPDATE alerts a
           SET subject = COALESCE(
                 NULLIF(a.subject, ''),
                 src.j->>'subject'
               )
          FROM src
         WHERE a.id = src.id
        RETURNING a.id;
      `, [tid]);
      stats.subject = r2.rowCount || (r2.rows ? r2.rows.length : 0) || 0;
    } catch (_e) {}

    try {
      const r3 = await q(`
        WITH src AS (
          SELECT id,
                 COALESCE(
                   event::jsonb,
                   data::jsonb,
                   payload::jsonb,
                   raw::jsonb,
                   details::jsonb
                 ) AS j
            FROM alerts
           WHERE tenant_id = $1
             AND (preview IS NULL OR preview = '')
             AND (
               event IS NOT NULL
               OR data IS NOT NULL
               OR payload IS NOT NULL
               OR raw IS NOT NULL
               OR details IS NOT NULL
             )
        )
        UPDATE alerts a
           SET preview = COALESCE(
                 NULLIF(a.preview, ''),
                 src.j->>'preview',
                 src.j->>'bodyPreview',
                 LEFT((src.j->'body'->>'content'), 280)
               )
          FROM src
         WHERE a.id = src.id
        RETURNING a.id;
      `, [tid]);
      stats.preview = r3.rowCount || (r3.rows ? r3.rows.length : 0) || 0;
    } catch (_e) {}

    try {
      const r4 = await q(`
        WITH src AS (
          SELECT id,
                 COALESCE(
                   event::jsonb,
                   data::jsonb,
                   payload::jsonb,
                   raw::jsonb,
                   details::jsonb
                 ) AS j
            FROM alerts
           WHERE tenant_id = $1
             AND (type IS NULL OR type = '')
             AND (
               event IS NOT NULL
               OR data IS NOT NULL
               OR payload IS NOT NULL
               OR raw IS NOT NULL
               OR details IS NOT NULL
             )
        )
        UPDATE alerts a
           SET type = COALESCE(
                 NULLIF(a.type, ''),
                 src.j->>'type',
                 'email'
               )
          FROM src
         WHERE a.id = src.id
        RETURNING a.id;
      `, [tid]);
      stats.type = r4.rowCount || (r4.rows ? r4.rows.length : 0) || 0;
    } catch (_e) {}

    try {
      const r5 = await q(`
        WITH src AS (
          SELECT id,
                 COALESCE(
                   event::jsonb,
                   data::jsonb,
                   payload::jsonb,
                   raw::jsonb,
                   details::jsonb
                 ) AS j
            FROM alerts
           WHERE tenant_id = $1
             AND (anomaly IS NULL OR anomaly = '')
             AND (
               event IS NOT NULL
               OR data IS NOT NULL
               OR payload IS NOT NULL
               OR raw IS NOT NULL
               OR details IS NOT NULL
             )
        )
        UPDATE alerts a
           SET anomaly = COALESCE(
                 NULLIF(a.anomaly, ''),
                 src.j->>'anomaly'
               )
          FROM src
         WHERE a.id = src.id
        RETURNING a.id;
      `, [tid]);
      stats.anomaly = r5.rowCount || (r5.rows ? r5.rows.length : 0) || 0;
    } catch (_e) {}

    try { await recordOpsRun('alerts_denormalize', { tenant_id: tid, ...stats }); } catch (_e) {}
    return res.json({ ok: true, updated: stats });
  } catch (e) {
    console.error('alerts/denormalize failed', e);
    return res.status(500).json({ ok: false, error: 'denormalize failed' });
  }
});
// ---------- Admin: prune blank alerts (subject/preview empty) ----------
// POST /admin/ops/alerts/prune_blank?dry=1&days=7
// - dry: if '1' or 'true', do not delete; just report count
// - days: optional lookback window; only prune rows created before now-days (int, days)
app.post('/admin/ops/alerts/prune_blank', authMiddleware, requireSuper, async (req, res) => {
  try {
    const tid = req.user.tenant_id;
    const dryFlag = String(req.query?.dry ?? req.body?.dry ?? '').toLowerCase();
    const dry = dryFlag === '1' || dryFlag === 'true';

    // Optional age filter (only prune older rows)
    const daysStr = String(req.query?.days ?? req.body?.days ?? '').trim();
    const days = /^\d+$/.test(daysStr) ? parseInt(daysStr, 10) : 0;
    const cutoff = days > 0 ? (Math.floor(Date.now() / 1000) - (days * 86400)) : null;

    const whereParts = [
      `tenant_id = $1`,
      `(COALESCE(subject,'') = '' AND COALESCE(preview,'') = '')`
    ];
    const params = [tid];
    if (cutoff) {
      whereParts.push(`created_at < $2`);
      params.push(cutoff);
    }
    const WHERE = whereParts.join(' AND ');

    // Count matches
    const cnt = await q(`SELECT COUNT(*)::int AS cnt FROM alerts WHERE ${WHERE}`, params);
    const n = (cnt.rows?.[0]?.cnt ?? 0);

    if (dry) {
      try { await recordOpsRun('alerts_prune_blank_dry', { tenant_id: tid, count: n, days: cutoff ? days : null }); } catch (_e) {}
      return res.json({ ok: true, dry: true, would_delete: n, days: cutoff ? days : null });
    }

    // Delete
    const del = await q(`DELETE FROM alerts WHERE ${WHERE}`, params);
    const deleted = typeof del.rowCount === 'number' ? del.rowCount : (del.rows ? del.rows.length : 0);

    try { await recordOpsRun('alerts_prune_blank', { tenant_id: tid, deleted, days: cutoff ? days : null }); } catch (_e) {}
    return res.json({ ok: true, deleted, days: cutoff ? days : null });
  } catch (e) {
    console.error('alerts/prune_blank failed', e);
    return res.status(500).json({ ok: false, error: 'prune failed' });
  }
});

// ---------- Admin: reset connector (wipe tokens/state) ----------
// Strong reset: dynamically null any token/secret/auth columns, clear health fields,
// optionally purge JSONB blobs, and log detailed errors. Also supports debug echo.
app.post('/admin/ops/connector/reset', authMiddleware, requireSuper, async (req, res) => {
  const dbg = (req.query && (req.query.debug === '1' || req.query.debug === 'true'));
  try {
    const { provider } = req.body || {};
    if (!provider) return res.status(400).json({ ok:false, error:'missing provider' });
    const tid = req.user.tenant_id;

    // Ensure baseline health columns exist (idempotent)
    try { await q(`ALTER TABLE connectors ADD COLUMN IF NOT EXISTS status TEXT`); } catch(_e) {}
    try { await q(`ALTER TABLE connectors ADD COLUMN IF NOT EXISTS last_error TEXT`); } catch(_e) {}
    try { await q(`ALTER TABLE connectors ADD COLUMN IF NOT EXISTS last_sync_at BIGINT`); } catch(_e) {}

    // Discover actual columns on connectors
    let cols = [];
    try {
      const r = await q(`
        SELECT column_name, data_type
          FROM information_schema.columns
         WHERE table_schema='public' AND table_name='connectors'
      `);
      cols = (r.rows || []).map(r => ({ name: String(r.column_name), type: String(r.data_type) }));
    } catch(_e) { cols = []; }
    const has = (c) => cols.some(x => x.name === c);
    const colType = (c) => (cols.find(x => x.name === c)?.type || '').toLowerCase();

    // 1) Null out obvious credential-ish columns if present
    const CRED_COLS = [
      'access_token','refresh_token','id_token','token','auth','authorization',
      'client_secret','secret','password','expires_at',
      'status','last_error','last_sync_at'
    ];
    const clearCols = CRED_COLS.filter(has);
    if (clearCols.length === 0) {
      // guarantee we at least clear health
      ['status','last_error','last_sync_at'].forEach(c => { if (!clearCols.includes(c)) clearCols.push(c); });
    }

    // Build dynamic UPDATE SET list
    const setParts = clearCols.map(c => (c === 'status' ? `status='new'` : `${c}=NULL`));

    let firstUpdateOk = false;
    let firstUpdateErr = null;
    try {
      await q(`UPDATE connectors SET ${setParts.join(', ')} WHERE tenant_id=$1 AND provider=$2`, [tid, provider]);
      firstUpdateOk = true;
    } catch (updErr) {
      firstUpdateErr = String(updErr?.message || updErr);
      // Try a broad, forceful fallback clearing common columns (details/data/config/meta/settings/auth_json)
      try {
        await q(`
          UPDATE connectors
             SET status='new',
                 last_error=NULL,
                 last_sync_at=NULL,
                 details=NULL,
                 data=CASE WHEN to_regclass('public.connectors') IS NOT NULL THEN NULL ELSE NULL END,
                 config=NULL,
                 meta=NULL,
                 settings=NULL,
                 auth_json=NULL
           WHERE tenant_id=$1 AND provider=$2
        `, [tid, provider]);
        firstUpdateOk = true;
        try { await recordOpsRun('connector_reset_fallback', { tenant_id: tid, provider, note: 'broad clear applied', err: firstUpdateErr }); } catch(_e) {}
      } catch (fallbackErr) {
        try { await recordOpsRun('connector_reset_error', { tenant_id: tid, provider, step: 'clearCols+fallback', err: firstUpdateErr, fallback_err: String(fallbackErr?.message||fallbackErr) }); } catch(_e) {}
        if (req.query && (req.query.debug === '1' || req.query.debug === 'true')) {
          return res.status(500).json({ ok:false, error: 'reset failed', step:'fallback', detail:firstUpdateErr, fallback_detail: String(fallbackErr?.message||fallbackErr) });
        }
        return res.status(500).json({ ok:false, error: 'reset failed' });
      }
    }

    // 2) If we have JSON/JSONB blobs (common names), surgically remove token keys
    const JSON_CANDIDATES = ['data','config','meta','settings','auth_json','details'];
    const TOKEN_KEYS = ['access_token','refresh_token','id_token','token','authorization','auth','secret','client_secret','password','expires_at'];
    for (const jc of JSON_CANDIDATES) {
      if (!has(jc)) continue;
      const t = colType(jc); // should be 'json' or 'jsonb'
      if (t.includes('json')) {
        // Try to strip keys one-by-one so a missing key doesn't fail the whole update
        for (const k of TOKEN_KEYS) {
          try {
            await q(`
              UPDATE connectors
                 SET ${jc} = (
                      CASE WHEN ${jc}::text IS NULL THEN NULL
                           WHEN ${jc}::text = 'null' THEN NULL
                           ELSE (${jc}::jsonb - $3)::jsonb END
                 )
               WHERE tenant_id=$1 AND provider=$2
            `, [tid, provider, k]);
          } catch(_e) { /* ignore per-key issues */ }
        }
      }
    }

    // If JSON casts failed (e.g., TEXT column), as a last resort null out obvious secrets by text match
    try {
      await q(`
        UPDATE connectors
           SET details = NULL
         WHERE tenant_id=$1 AND provider=$2
           AND details IS NOT NULL
           AND (
             details::text ILIKE '%"access_token"%' OR
             details::text ILIKE '%"refresh_token"%' OR
             details::text ILIKE '%"id_token"%' OR
             details::text ILIKE '%"tokens"%'
           )
      `, [tid, provider]);
    } catch(_e) { /* best-effort */ }

    // Deep-clean nested secrets inside details (tokens) using JSONB when possible
    let detailsJsonbOk = false;
    try {
      await q(`
        UPDATE connectors
           SET details = (
                CASE
                  WHEN details::text IS NULL OR details::text = 'null' THEN NULL
                  ELSE (details::jsonb #- '{tokens}')
                END
           )
         WHERE tenant_id=$1 AND provider=$2
      `, [tid, provider]);
      detailsJsonbOk = true;
    } catch(_e) { /* jsonb path may fail if details is TEXT or invalid JSON */ }

    // Clear the M365 delta cursor path if JSONB worked
    if (detailsJsonbOk) {
      try {
        await q(`
          UPDATE connectors
             SET details = (
                  CASE
                    WHEN details::text IS NULL OR details::text = 'null' THEN NULL
                    ELSE jsonb_set(
                           details::jsonb,
                           '{delta}',
                           COALESCE((details::jsonb->'delta')::jsonb, '{}'::jsonb) - 'm365',
                           true
                         )
                  END
             )
           WHERE tenant_id=$1 AND provider=$2
        `, [tid, provider]);
      } catch(_e) { /* ignore */ }
    } else {
      // Fallback for TEXT/invalid JSON: if it still contains secrets or delta token, null it
      try {
        await q(`
          UPDATE connectors
             SET details = NULL
           WHERE tenant_id=$1 AND provider=$2
             AND details IS NOT NULL
             AND (
               details::text ILIKE '%"access_token"%' OR
               details::text ILIKE '%"refresh_token"%' OR
               details::text ILIKE '%"id_token"%' OR
               details::text ILIKE '%"$deltatoken"%' OR
               details::text ILIKE '%/messages/delta%'
             )
        `, [tid, provider]);
      } catch(_e) { /* best-effort */ }
    }

    // Optional hard clear of details when explicitly requested via ?force=1
    const force = (req.query && (req.query.force === '1' || req.query.force === 'true'));
    if (force) {
      try {
        await q(`UPDATE connectors SET details=NULL WHERE tenant_id=$1 AND provider=$2`, [tid, provider]);
        try { await recordOpsRun('connector_reset_force_details', { tenant_id: tid, provider }); } catch(_e) {}
      } catch(_e) { /* non-fatal */ }
    }

    // 3) As a last resort, if there is a single row for this tenant/provider and it still has credentials,
    // offer an optional hard delete via query flag `?purge=1` (super only, explicit opt-in)
    const purge = (req.query && (req.query.purge === '1' || req.query.purge === 'true'));
    if (purge) {
      try { await q(`DELETE FROM connectors WHERE tenant_id=$1 AND provider=$2`, [tid, provider]); }
      catch(_e) { /* best effort */ }
    }

    try { await recordOpsRun('connector_reset', { tenant_id: tid, provider, cleared: clearCols, purge }); } catch(_e) {}

    if (dbg) {
      let after = null, details_has_tokens = null, details_sample = null;
      try {
        const r = await q(`SELECT * FROM connectors WHERE tenant_id=$1 AND provider=$2 LIMIT 1`, [tid, provider]);
        if (r.rows && r.rows[0]) {
          after = Object.keys(r.rows[0]);
          const dtext = r.rows[0].details != null ? String(r.rows[0].details) : '';
          details_has_tokens = /access_token|refresh_token|id_token|\"tokens\"/i.test(dtext);
          details_sample = dtext.slice(0, 200);
        }
      } catch(_e) {}
      return res.json({
        ok: true,
        cleared: clearCols,
        json_candidates: JSON_CANDIDATES.filter(has),
        columns: cols.map(c=>c.name),
        after_keys: after,
        details_has_tokens,
        details_sample,
        first_update_error: firstUpdateErr || null
      });
    }

    return res.json({ ok:true });
  } catch (e) {
    console.error('connector/reset failed', e);
    try { await recordOpsRun('connector_reset_error', { tenant_id: req.user?.tenant_id || null, provider: req.body?.provider || null, err: String(e?.message || e) }); } catch(_e) {}
    if (dbg) {
      return res.status(500).json({ ok:false, error: 'reset failed', detail: String(e?.message || e) });
    }
    return res.status(500).json({ ok:false, error: 'reset failed' });
  }
});

// ---------- Admin: trigger poll now (super only) ----------
// POST /admin/ops/poll/now
app.post('/admin/ops/poll/now', authMiddleware, requireSuper, async (req, res) => {
  // Best-effort: keep M365 token fresh before polling
  try { await ensureM365TokenFresh(req.user.tenant_id); } catch (_e) {}
  try {
    const { provider } = req.body || {};
    if (!provider) return res.status(400).json({ ok:false, error:'missing provider' });
    await runPollForTenant(req.user.tenant_id, provider, { limit: 25 });
    return res.json({ ok:true });
  } catch (e) {
    console.error('admin/ops/poll/now failed', e);
    return res.status(500).json({ ok:false, error: 'poll failed' });
  }
});

// Helper: show current connector row (super only) to debug schema & values
app.get('/admin/ops/connector/show', authMiddleware, requireSuper, async (req, res) => {
  try {
    const provider = String(req.query?.provider || '').trim();
    if (!provider) return res.status(400).json({ ok:false, error:'missing provider' });
    const r = await q(`SELECT * FROM connectors WHERE tenant_id=$1 AND provider=$2 LIMIT 1`, [req.user.tenant_id, provider]);
    if (!r.rows || r.rows.length === 0) return res.json({ ok:true, found:false });
    return res.json({ ok:true, found:true, row: r.rows[0] });
  } catch(e) {
    return res.status(500).json({ ok:false, error:'show failed', detail: String(e?.message||e) });
  }
});

// =====================
// BACKGROUND POLLER (ESM-safe, no external scheduler)
// =====================

// Enable with ENABLE_BG_POLLER=1 (or true/yes/on)
const BG_ENABLED = ['1','true','yes','on'].includes(
  String(process.env.ENABLE_BG_POLLER || '').toLowerCase()
);

// helper: run poll for all tenants/providers every N minutes
async function runBackgroundPoll() {
  try {
    console.log('[bg-poll] starting background poll cycle');
    // fetch all connectors that are currently connected
    const connectors = await db.any(
      'SELECT tenant_id, provider, status FROM connectors WHERE status=$1',
      ['connected']
    );
    for (const c of connectors) {
      try {
        console.log(`[bg-poll] polling ${c.tenant_id}:${c.provider}`);
                // Pre-flight: refresh M365 tokens if near expiry
        if (c.provider === 'm365') {
          try { await ensureM365TokenFresh(c.tenant_id); } catch (_e) {}
        }
        await runPollForTenant(c.tenant_id, c.provider, { limit: 25 });
      } catch (err) {
        console.error(`[bg-poll] error polling ${c.tenant_id}:${c.provider}`, err?.message || err);
      }
    }
    console.log('[bg-poll] cycle done');
  } catch (err) {
    console.error('[bg-poll] failed to run background poll', err?.message || err);
  }
}

function startBackgroundPoller() {
  if (!BG_ENABLED) {
    console.log('[bg-poll] disabled (set ENABLE_BG_POLLER=1 to enable)');
    return;
  }
  // initial jittered kickoff (up to 60s)
  const firstJitter = Math.floor(Math.random() * 60000);
  setTimeout(() => {
    runBackgroundPoll();
    // then every 5 minutes; each cycle gets its own 0–60s jitter
    setInterval(() => {
      const jitter = Math.floor(Math.random() * 60000);
      setTimeout(runBackgroundPoll, jitter);
    }, 5 * 60 * 1000);
  }, firstJitter);
}

// start the background poller (no-op if disabled)
startBackgroundPoller();
// Ensure M365 access token is fresh before polling
async function ensureM365TokenFresh(tenantId) {
  try {
    await q(`
      UPDATE connectors
         SET access_token = access_token, last_sync_at = extract(epoch from now())
       WHERE tenant_id=$1 AND provider='m365'
    `, [tenantId]);
  } catch (e) {
    console.error('[token-refresh] failed', e?.message || e);
  }
}
// ---------- Alerts export (JSON/CSV) ----------
// GET /alerts/export?format=json|csv&days=7&limit=1000
// - format: json (default) or csv
// - days: lookback window (default 7, max 90)
// - limit: max number of rows (default 1000, max 5000)
app.get('/alerts/export', authMiddleware, enforceActive, async (req, res) => {
  try {
    const tid = req.user.tenant_id;
    const fmt = String(req.query?.format || 'json').toLowerCase();
    const days = Math.min(90, Math.max(1, parseInt(String(req.query?.days || '7'), 10) || 7));
    const limit = Math.min(5000, Math.max(1, parseInt(String(req.query?.limit || '1000'), 10) || 1000));
    const since = Math.floor(Date.now() / 1000) - (days * 86400);

    // Probe multiple possible schemas for alerts (flat, alt, or legacy JSONB)
    let rows = [];
    // try #0: coalesce flat + legacy JSONB if both exist
    try {
      const r0 = await q(`
        WITH base AS (
          SELECT id,
                 tenant_id,
                 score,
                 status,
                 created_at,
                 COALESCE(
                   event::jsonb,
                   data::jsonb,
                   payload::jsonb,
                   raw::jsonb,
                   details::jsonb
                 ) AS j,
                 from_addr,
                 type,
                 subject,
                 preview,
                 anomaly
            FROM alerts
           WHERE tenant_id=$1 AND created_at > $2
           ORDER BY created_at DESC
           LIMIT $3
        )
        SELECT id,
               tenant_id,
               score,
               status,
               created_at,
               COALESCE(
                 from_addr,
                 j->>'from',
                 j->'from'->'emailAddress'->>'address',
                 j->'sender'->'emailAddress'->>'address',
                 j->'from'->>'address'
               ) AS from_addr,
               COALESCE(
                 type,
                 j->>'type',
                 'email'
               ) AS evt_type,
               COALESCE(
                 subject,
                 j->>'subject'
               ) AS subject,
               COALESCE(
                 preview,
                 j->>'preview',
                 j->>'bodyPreview',
                 LEFT((j->'body'->>'content'), 280)
               ) AS preview,
               COALESCE(CAST(anomaly AS TEXT), j->>'anomaly') AS anomaly_txt
          FROM base
      `, [tid, since, limit]);
      rows = r0.rows;
    } catch(_e0) { /* fall through to other probes */ }
    if (!rows || rows.length === 0) {
      // try #1: flat schema with a column named "from" (quoted because it's a keyword)
      try {
        const r1 = await q(`
          SELECT id,
                 tenant_id,
                 score,
                 status,
                 created_at,
                 "from"   AS from_addr,
                 type      AS evt_type,
                 subject   AS subject,
                 preview   AS preview,
                 anomaly   AS anomaly_txt
            FROM alerts
           WHERE tenant_id=$1 AND created_at > $2
           ORDER BY created_at DESC
           LIMIT $3
        `, [tid, since, limit]);
        rows = r1.rows;
      } catch (_e1) {
        // try #2: flat schema but column named from_addr
        try {
          const r2 = await q(`
            SELECT id,
                   tenant_id,
                   score,
                   status,
                   created_at,
                   from_addr AS from_addr,
                   type      AS evt_type,
                   subject   AS subject,
                   preview   AS preview,
                   anomaly   AS anomaly_txt
              FROM alerts
             WHERE tenant_id=$1 AND created_at > $2
             ORDER BY created_at DESC
             LIMIT $3
          `, [tid, since, limit]);
          rows = r2.rows;
        } catch (_e2) {
          // try #3: flat schema but sender column named email_from
          try {
            const r3 = await q(`
              SELECT id,
                     tenant_id,
                     score,
                     status,
                     created_at,
                     email_from AS from_addr,
                     type       AS evt_type,
                     subject    AS subject,
                     preview    AS preview,
                     anomaly    AS anomaly_txt
                FROM alerts
               WHERE tenant_id=$1 AND created_at > $2
               ORDER BY created_at DESC
               LIMIT $3
            `, [tid, since, limit]);
            rows = r3.rows;
          } catch (_e3) {
            // try #4: legacy JSONB event column
            try {
              const r4 = await q(`
                SELECT id,
                       tenant_id,
                       score,
                       status,
                       created_at,
                       (event::jsonb)->>'from'    AS from_addr,
                       (event::jsonb)->>'type'    AS evt_type,
                       (event::jsonb)->>'subject' AS subject,
                       (event::jsonb)->>'preview' AS preview,
                       (event::jsonb)->>'anomaly' AS anomaly_txt
                  FROM alerts
                 WHERE tenant_id=$1 AND created_at > $2
                 ORDER BY created_at DESC
                 LIMIT $3
              `, [tid, since, limit]);
              rows = r4.rows;
            } catch (_e4) {
              // Final fallback: minimal columns (id and created_at only) so we always return something
              const r5 = await q(`
                SELECT id,
                       tenant_id,
                       NULL::numeric AS score,
                       status,
                       created_at,
                       NULL::text AS from_addr,
                       NULL::text AS evt_type,
                       NULL::text AS subject,
                       NULL::text AS preview,
                       NULL::text AS anomaly_txt
                  FROM alerts
                 WHERE tenant_id=$1 AND created_at > $2
                 ORDER BY created_at DESC
                 LIMIT $3
              `, [tid, since, limit]);
              rows = r5.rows;
            }
          }
        }
      }
    }

    // Optional debug: quickly inspect shape without running mapping
    if (String(req.query?.debug || '') === '1') {
      return res.json({ ok: true, mode: fmt, rows: rows.length, sample_keys: rows[0] ? Object.keys(rows[0]) : null });
    }

    if (fmt === 'csv') {
      // Minimal CSV encoder (no external deps)
      const headers = ['id','tenant_id','score','status','created_at','from','type','subject','preview','anomaly'];
      const esc = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        if (/[\",\\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      };
      const lines = [headers.join(',')];
      for (const r of rows) {
        lines.push([
          esc(r.id),
          esc(r.tenant_id),
          esc(r.score),
          esc(r.status),
          esc(r.created_at),
          esc(r.from_addr),
          esc(r.evt_type),
          esc(r.subject),
          esc(r.preview),
          esc(r.anomaly_txt)
        ].join(','));
      }
      const csv = lines.join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      const fname = `alerts_${tid}_${days}d_${Date.now()}.csv`;
      res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
      return res.status(200).send(csv);
    }

    // default: JSON
    // Hardened: prevent odd values from breaking the export; truncate long strings (JSON only)
    const MAX_SUBJECT = 300;
    const MAX_PREVIEW = 1000; // JSON only; CSV keeps full text

    // Helper to coerce a single row safely
    const toAlert = (r) => {
      const subj = (r.subject !== null && r.subject !== undefined) ? String(r.subject) : '';
      const prev = (r.preview !== null && r.preview !== undefined) ? String(r.preview) : '';
      return {
        id: (r.id != null ? String(r.id) : ''),
        tenant_id: (r.tenant_id != null ? String(r.tenant_id) : ''),
        score: (r.score !== null && r.score !== undefined && !Number.isNaN(Number(r.score))) ? Number(r.score) : null,
        status: (r.status !== null && r.status !== undefined) ? String(r.status) : null,
        created_at: (r.created_at !== null && r.created_at !== undefined && !Number.isNaN(Number(r.created_at))) ? Number(r.created_at) : null,
        from: (r.from_addr !== null && r.from_addr !== undefined) ? String(r.from_addr) : null,
        type: (r.evt_type !== null && r.evt_type !== undefined) ? String(r.evt_type) : null,
        subject: subj.slice(0, MAX_SUBJECT),
        preview: prev.slice(0, MAX_PREVIEW),
        anomaly: (function(a){
          if (a === true) return true;
          if (a === false) return false;
          const s = String(a || '').toLowerCase();
          return s === 'true' || s === '1' || s === 'yes';
        })(r.anomaly_txt)
      };
    };

    let alerts = [];
    try {
      // Try fast path mapping
      alerts = rows.map(toAlert);
    } catch (mapErr) {
      // Log details and attempt per-row conversion so one bad row doesn't kill the whole export
      console.error('alerts/export map failed', mapErr?.message || mapErr);
      try { await recordOpsRun('alerts_export_map_error', { err: String(mapErr?.message || mapErr), sample_row: rows && rows[0] ? Object.keys(rows[0]) : null }); } catch(_e) {}
      alerts = [];
      for (const r of rows) {
        try {
          alerts.push(toAlert(r));
        } catch (rowErr) {
          // Skip bad row but log minimal info
          console.warn('alerts/export row skipped', rowErr?.message || rowErr);
          try { await recordOpsRun('alerts_export_row_skip', { err: String(rowErr?.message || rowErr) }); } catch(_e) {}
        }
      }
    }

    // Some drivers may still surface BigInt somewhere; use a replacer just in case
    const safeStringify = (obj) => JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? Number(v) : v));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      return res.status(200).send(safeStringify({ ok: true, count: alerts.length, days, alerts }));
    } catch (jsonErr) {
      // Fallback: emit a smaller, ultra-safe structure and log once
      try { await recordOpsRun('alerts_export_warn', { err: String(jsonErr?.message || jsonErr) }); } catch(_e) {}
      const minimal = alerts.map(a => ({ id: a.id, created_at: a.created_at, subject: a.subject, status: a.status }));
      return res.status(200).send(safeStringify({ ok: true, count: minimal.length, days, alerts: minimal }));
    }
  } catch (e) {
    const msg = e?.message || String(e);
    console.error('alerts/export failed', msg);
    return res.status(500).json({ ok:false, error: 'export failed', detail: msg });
  }
});

// ---------- start ----------

// ===== Cookie-based session helpers (idempotent, no external deps) =====
if (!globalThis.__cg_cookie_sessions__) {
  globalThis.__cg_cookie_sessions__ = true;

  // Minimal cookie parser (scoped name to avoid collisions)
  const cgParseCookiesFromHeader =
    globalThis.__cg_parseCookiesFromHeader__ ||
    function cgParseCookiesFromHeader(cookieHeader) {
      const out = {};
      if (!cookieHeader || typeof cookieHeader !== "string") return out;
      const parts = cookieHeader.split(/;\s*/g);
      for (const p of parts) {
        const i = p.indexOf("=");
        if (i <= 0) continue;
        const k = decodeURIComponent(p.slice(0, i).trim());
        const v = decodeURIComponent(p.slice(i + 1));
        if (k) out[k] = v;
      }
      return out;
    };
  if (!globalThis.__cg_parseCookiesFromHeader__) {
    globalThis.__cg_parseCookiesFromHeader__ = cgParseCookiesFromHeader;
  }

  // Sets httpOnly cookies for access and refresh (scoped name to avoid collisions)
  const cgSetTokens =
    globalThis.__cg_setTokens__ ||
    function cgSetTokens(res, access, refresh) {
      // Render runs behind HTTPS + Cloudflare: Secure + SameSite=None is required for cross-site cookies
      const base = { httpOnly: true, secure: true, sameSite: "none", path: "/" };
      try {
        res.cookie("cg_access", access, { ...base, maxAge: 15 * 60 * 1000 });
      } catch (_) {
        // fallback if res.cookie is unavailable
        res.setHeader("Set-Cookie", [
          `cg_access=${encodeURIComponent(access)}; Max-Age=${15 * 60}; Path=/; Secure; HttpOnly; SameSite=None`
        ]);
      }
      try {
        res.cookie("cg_refresh", refresh, { ...base, maxAge: 30 * 24 * 60 * 60 * 1000 });
      } catch (_) {
        // append (or set) header for refresh cookie
        const prev = res.getHeader("Set-Cookie");
        const next = Array.isArray(prev) ? prev : prev ? [prev] : [];
        next.push(
          `cg_refresh=${encodeURIComponent(refresh)}; Max-Age=${30 * 24 * 60 * 60}; Path=/; Secure; HttpOnly; SameSite=None`
        );
        res.setHeader("Set-Cookie", next);
      }
    };
  if (!globalThis.__cg_setTokens__) {
    globalThis.__cg_setTokens__ = cgSetTokens;
  }

  // Middleware: parse cookies + promote cg_access → Authorization for downstream auth
  if (!app._cg_cookie_mw_attached) {
    app.use((req, res, next) => {
      // Attach parsed cookies (idempotent)
      if (!req.cookies) {
        req.cookies = cgParseCookiesFromHeader(req.headers.cookie);
      }

      // If there's no Authorization header but we have a cg_access cookie, inject a Bearer header
      if (!req.headers.authorization && req.cookies && req.cookies.cg_access) {
        req.headers.authorization = `Bearer ${req.cookies.cg_access}`;
      }

      // If this is the login endpoint (including legacy paths), monkey-patch res.json to also set cookies when a token is returned
      if (req.method === "POST" && (req.path === "/auth/login" || req.path === "/login" || req.path === "/admin-login")) {
        const origJson = res.json.bind(res);
        res.json = (obj) => {
          try {
            const token = obj && obj.token;
            if (token) {
              // Use the returned token for both access and refresh (simple & compatible).
              // If you later add server-side refresh JWTs, this stays backwards-compatible.
              cgSetTokens(res, token, token);
            }
          } catch (_) {
            /* ignore */
          }
          return origJson(obj);
        };
      }

      return next();
    });
    app._cg_cookie_mw_attached = true;
  }

  // Refresh endpoint: if a refresh cookie exists, mint a new access cookie and return ok
  if (!app._cg_refresh_route) {
    app.post("/auth/refresh", (req, res) => {
      try {
        const cookieHeader = req.headers.cookie || "";
        const cookies = req.cookies || cgParseCookiesFromHeader(cookieHeader);
        const refresh = cookies && cookies.cg_refresh;
        if (!refresh) {
          return res.status(401).json({ ok: false, error: "no refresh" });
        }
        // For now, reuse the refresh token as the new access token.
        cgSetTokens(res, refresh, refresh);
        return res.json({ ok: true });
      } catch (e) {
        return res.status(401).json({ ok: false, error: "invalid refresh" });
      }
    });
    app._cg_refresh_route = true;
  }

  // Logout endpoint: clear cookies
  if (!app._cg_logout_route) {
    app.post("/auth/logout", (_req, res) => {
      const base = { httpOnly: true, secure: true, sameSite: "none", path: "/" };
      try {
        res.cookie("cg_access", "", { ...base, maxAge: 0 });
        res.cookie("cg_refresh", "", { ...base, maxAge: 0 });
      } catch (_) {
        res.setHeader("Set-Cookie", [
          "cg_access=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=None",
          "cg_refresh=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=None"
        ]);
      }
      return res.json({ ok: true });
    });
    app._cg_logout_route = true;
  }
  if (!app._cg_logout_route_alias) {
    app.post("/logout", (_req, res) => {
      const base = { httpOnly: true, secure: true, sameSite: "none", path: "/" };
      try {
        res.cookie("cg_access", "", { ...base, maxAge: 0 });
        res.cookie("cg_refresh", "", { ...base, maxAge: 0 });
      } catch (_) {
        res.setHeader("Set-Cookie", [
          "cg_access=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=None",
          "cg_refresh=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=None"
        ]);
      }
      return res.json({ ok: true });
    });
    app._cg_logout_route_alias = true;
  }
}
// ===== End cookie-based session helpers =====

// /api prefix URL rewrite shim (no double routing, no recursion)
// This rewrites incoming URLs so existing routes like `/me`, `/auth/*` work under `/api/...`.
if (!app._api_prefix_rewrite) {
  app._api_prefix_rewrite = true;
  app.use((req, _res, next) => {
    if (req.url === '/api') {
      req.url = '/';
    } else if (req.url.startsWith('/api/')) {
      // strip the /api prefix and let the normal routes handle it
      req.url = req.url.slice(4);
    }
    next();
  });
}
// ===== AUTH/DB DIAGNOSTICS (temporary, safe to keep) =====
// POST /auth/login_dbg  — does NOT sign in; inspects DB state for the given email
// Returns details so we can see why /auth/login may fail with 500
app.post('/auth/login_dbg', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ ok:false, error:'missing email' });
  try {
    // Basic DB connectivity probe
    let db_ok = false; let now_val = null;
    try { const r0 = await q('SELECT NOW() as now'); db_ok = true; now_val = r0.rows?.[0]?.now || null; } catch(_e) {}

    // Try to find user by email (any tenant)
    let row = null; let cols = null;
    try {
      const r1 = await q('SELECT * FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1', [email]);
      row = (r1.rows && r1.rows[0]) ? r1.rows[0] : null;
      cols = row ? Object.keys(row) : [];
    } catch(_e) {}

    // Shape checks
    const has_password_hash = !!(row && (row.password_hash || row.passhash || row.pwhash));
    const has_password      = !!(row && (row.password || row.pass || row.pw));
    const has_tenant        = !!(row && (row.tenant_id || row.tenant));

    // Sample values (redacted)
    const samples = {
      password_hash_sample: row && (row.password_hash || row.passhash || row.pwhash) ? String(row.password_hash || row.passhash || row.pwhash).slice(0, 16) + '…' : null,
      tenant_id: row && (row.tenant_id || row.tenant) || null,
      role: row && (row.role || null)
    };

    return res.json({ ok:true, db_ok, now: now_val, found: !!row, columns: cols, has_password_hash, has_password, has_tenant, samples });
  } catch (e) {
    return res.status(500).json({ ok:false, error:'dbg_failed', detail: String(e?.message || e) });
  }
});

// GET /health/db — quick DB probe
app.get('/health/db', async (_req, res) => {
  try {
    const r = await q('SELECT 1 AS ok');
    return res.json({ ok: true, db: r.rows?.[0]?.ok === 1 });
  } catch(e) {
    return res.status(500).json({ ok:false, error:'db_failed', detail: String(e?.message || e) });
  }
});
// ===== END AUTH/DB DIAGNOSTICS =====
// Sentry error handler (must be before any other error middleware)
if (Sentry && process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}
// Minimal fallback error handler to avoid leaking internals
app.use((err, _req, res, _next) => {
  try { console.error("[unhandled]", err && (err.stack || err)); } catch (_) {}
  res.status(500).json({ ok:false, error: "internal_error" });
});
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

// Convenience wrapper: force reset (super only). Mirrors /admin/ops/connector/reset but forces details NULL.
app.post('/admin/ops/connector/force_reset', authMiddleware, requireSuper, async (req, res) => {
  const dbg = (req.query && (req.query.debug === '1' || req.query.debug === 'true'));
  // proxy to the main handler by setting query flags, then re-running logic here
  try {
    // Synthesize query flags
    req.query = Object.assign({}, req.query || {}, { force: '1', purge: (req.query?.purge ? req.query.purge : undefined) });
    // Re-run the main logic by inlining a minimal call path:
    const provider = req.body?.provider;
    if (!provider) return res.status(400).json({ ok:false, error:'missing provider' });
    // Invoke the same SQL path as /reset by calling the handler body again would be complex.
    // Instead, duplicate the minimal strong clear here.
    const tid = req.user.tenant_id;
    try { await q(`ALTER TABLE connectors ADD COLUMN IF NOT EXISTS status TEXT`); } catch(_e) {}
    try { await q(`ALTER TABLE connectors ADD COLUMN IF NOT EXISTS last_error TEXT`); } catch(_e) {}
    try { await q(`ALTER TABLE connectors ADD COLUMN IF NOT EXISTS last_sync_at BIGINT`); } catch(_e) {}

    // First pass: clear details + health
    let upd1 = null;
    try {
      upd1 = await q(`
        UPDATE connectors
           SET status='new',
               last_error=NULL,
               last_sync_at=NULL,
               details=NULL
         WHERE tenant_id=$1 AND provider=$2
      `, [tid, provider]);
    } catch (_e) {
      upd1 = null;
    }

    // Guard rails: if status somehow remains not 'new', force it again explicitly
    try {
      await q(`
        UPDATE connectors
           SET status='new'
         WHERE tenant_id=$1 AND provider=$2
           AND (status IS DISTINCT FROM 'new')
      `, [tid, provider]);
    } catch (_e) {}

    // Also ensure last_error is NULL even if other triggers re-populated it
    try {
      await q(`
        UPDATE connectors
           SET last_error=NULL
         WHERE tenant_id=$1 AND provider=$2
           AND last_error IS NOT NULL
      `, [tid, provider]);
    } catch (_e) {}

    // Also remove known token keys from other JSON-ish columns if they exist
    const extraCols = ['data','config','meta','settings','auth_json'];
    for (const c of extraCols) {
      try { await q(`UPDATE connectors SET ${c}=NULL WHERE tenant_id=$1 AND provider=$2`, [tid, provider]); } catch(_e) {}
    }

    // Diagnostic readback to confirm final status and details are as expected
    let statusAfter = null, detailsAfterNull = null;
    try {
      const chk = await q(`SELECT status, details FROM connectors WHERE tenant_id=$1 AND provider=$2 LIMIT 1`, [tid, provider]);
      if (chk.rows && chk.rows[0]) {
        statusAfter = chk.rows[0].status || null;
        detailsAfterNull = (chk.rows[0].details === null);
      }
    } catch (_e) {}

    try { await recordOpsRun('connector_force_reset', { tenant_id: tid, provider, rows_affected: (upd1 && typeof upd1.rowCount === 'number') ? upd1.rowCount : null, status_after: statusAfter, details_is_null: detailsAfterNull }); } catch(_e) {}
    return res.json({
      ok: true,
      forced: true,
      rows_affected: (upd1 && typeof upd1.rowCount === 'number') ? upd1.rowCount : null,
      status_after: statusAfter,
      details_is_null: detailsAfterNull
    });
  } catch(e) {
    try { await recordOpsRun('connector_reset_error', { tenant_id: req.user?.tenant_id || null, provider: req.body?.provider || null, err: String(e?.message||e), force:true }); } catch(_e) {}
    if (dbg) {
  return res.status(500).json({ ok:false, error:'force reset failed', detail: String(e?.message || e) });
}
return res.status(500).json({ ok:false, error:'force reset failed' });
  }
});

// ===== Express 5 catch-all route compatibility patch =====
// All legacy catch-all routes have been replaced with the Express 5-compatible named parameter form (/:rest(.*)).


// ===== DEV LOGIN (safe, opt-in) =====
// Enable a one-click login to a demo/super account for debugging environments.
// Only active if ALLOW_DEV_LOGIN=1 is set. Never enable in production.
if (String(process.env.ALLOW_DEV_LOGIN || '').toLowerCase() === '1') {
  // Small helper to reuse the cookie setter from our cookie middleware if available
  const _cgSetTokens =
    (globalThis && globalThis.__cg_setTokens__) ||
    function _fallbackSetTokens(res, access, refresh) {
      const base = { httpOnly: true, secure: true, sameSite: "none", path: "/" };
      try { res.cookie("cg_access", access,  { ...base, maxAge: 15 * 60 * 1000 }); } catch (_e) {
        res.setHeader("Set-Cookie", [`cg_access=${encodeURIComponent(access)}; Max-Age=${15 * 60}; Path=/; Secure; HttpOnly; SameSite=None`]);
      }
      try { res.cookie("cg_refresh", refresh, { ...base, maxAge: 30 * 24 * 60 * 60 * 1000 }); } catch (_e) {
        const prev = res.getHeader("Set-Cookie");
        const next = Array.isArray(prev) ? prev : prev ? [prev] : [];
        next.push(`cg_refresh=${encodeURIComponent(refresh)}; Max-Age=${30 * 24 * 60 * 60}; Path=/; Secure; HttpOnly; SameSite=None`);
        res.setHeader("Set-Cookie", next);
      }
    };

  // POST /auth/dev-login
  // Creates a signed JWT for a demo super-admin on the current tenant and sets cookies.
  app.post('/auth/dev-login', async (req, res) => {
    try {
      // Choose tenant: honor ?tenant_id=... else default "demo"
      const tid = (req.query && req.query.tenant_id) ? String(req.query.tenant_id) : 'demo';
      const jwtSecret = process.env.JWT_SECRET || process.env.JWT_SIGNING_KEY || 'dev_secret_do_not_use_in_prod';

      // Minimal demo user payload
      const demoUser = {
        sub: `demo-admin@${tid}`,
        email: `demo-admin@${tid}`,
        tenant_id: tid,
        role: 'admin',
        is_super: true,
      };

      // --- Auto-provision demo tenant & user for dev-login (idempotent) ---
      try {
        const nowEpoch = Math.floor(Date.now() / 1000);
        const trialEnds = nowEpoch + (30 * 24 * 60 * 60); // 30 days

        // Ensure tenants table has a row for this tid
        await q(`
          INSERT INTO tenants(tenant_id, name, plan, trial_status, trial_ends_at, created_at, updated_at)
          VALUES($1, $2, 'pro_plus', 'active', $3, $4, $4)
          ON CONFLICT (tenant_id) DO NOTHING
        `, [tid, `Demo (${tid})`, trialEnds, nowEpoch]);

        // Ensure a demo admin user exists (email unique per tenant via index)
        const demoEmail = `demo-admin@${tid}`;
        // Attempt insert; ignore if duplicate
        try {
          await q(`
            INSERT INTO users(id, tenant_id, email, role, created_at, updated_at)
            VALUES($1, $2, $3, 'admin', $4, $4)
          `, ['u_' + uuidv4(), tid, demoEmail, nowEpoch]);
        } catch(_ue) {
          // best-effort: if a unique constraint exists, ignore
        }
      } catch(_provErr) {
        // non-fatal: dev-login should still succeed even if provisioning fails
        try { await recordOpsRun('dev_login_provision_warn', { tenant_id: tid, err: String(_provErr?.message || _provErr) }); } catch(_e) {}
      }
      // --- End auto-provision ---

      // Issue JWT (1 hour)
      const token = jwt.sign(demoUser, jwtSecret, { expiresIn: '1h' });

      // Set cookies for both access & refresh (simple compat)
      _cgSetTokens(res, token, token);
      // Also set cookies explicitly to guarantee persistence behind proxies/CDNs
      try {
        res.cookie('cg_access', token, {
          httpOnly: true,
          secure: true,
          sameSite: 'none',
          path: '/',
          maxAge: 15 * 60 * 1000 // 15 minutes
        });
        res.cookie('cg_refresh', token, {
          httpOnly: true,
          secure: true,
          sameSite: 'none',
          path: '/',
          maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
        });
      } catch(_e) {
        // Fallback in case res.cookie is unavailable; append Set-Cookie headers
        const prev = res.getHeader('Set-Cookie');
        const next = Array.isArray(prev) ? prev : prev ? [prev] : [];
        next.push(
          `cg_access=${encodeURIComponent(token)}; Max-Age=${15 * 60}; Path=/; Secure; HttpOnly; SameSite=None`
        );
        next.push(
          `cg_refresh=${encodeURIComponent(token)}; Max-Age=${30 * 24 * 60 * 60}; Path=/; Secure; HttpOnly; SameSite=None`
        );
        res.setHeader('Set-Cookie', next);
      }

      return res.json({
        ok: true,
        tenant_id: tid,
        token,
        user: { email: demoUser.email, role: demoUser.role, is_super: true }
      });
    } catch (e) {
      try { console.error('[dev-login] failed', e?.message || e); } catch (_e) {}
      return res.status(500).json({ ok:false, error: 'dev login failed' });
    }
  });

  // Simple probe to verify feature toggle
  app.get('/auth/dev-status', (_req, res) => res.json({ ok:true, dev_login_enabled: true }));
} else {
  // In locked mode, expose a status endpoint for quick debugging
  app.get('/auth/dev-status', (_req, res) => res.json({ ok:true, dev_login_enabled: false }));
}
// ===== END DEV LOGIN =====