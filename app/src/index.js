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

const OPENAI_API_KEY=process.env.OPENAI_API_KEY||"";
const AI_MODEL=process.env.AI_MODEL||"gpt-4o-mini";
const SLACK_WEBHOOK_URL=process.env.SLACK_WEBHOOK_URL||"";
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const PORT=process.env.PORT||8080;
const BRAND="CyberGuard Pro Cloud API";
const JWT_SECRET=process.env.JWT_SECRET||"dev_secret_key";
const ADMIN_KEY=process.env.ADMIN_KEY||"dev_admin_key";
const DATABASE_URL=process.env.DATABASE_URL||"postgres://cybermon:cyberpass@localhost:5432/cyberguardpro";
const pool=new pg.Pool({connectionString:DATABASE_URL,ssl:false});
const q=(sql,vals=[])=>pool.query(sql,vals);
const bus = new EventEmitter();

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(cors({
  origin: (_o, cb) => cb(null, true),
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "x-api-key",
    "x-admin-key"
  ],
  exposedHeaders: [
    "RateLimit-Policy",
    "RateLimit-Limit",
    "RateLimit-Remaining",
    "RateLimit-Reset"
  ]
}));
app.options("*", cors({
  origin: (_o, cb) => cb(null, true),
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "x-api-key",
    "x-admin-key"
  ],
  exposedHeaders: [
    "RateLimit-Policy",
    "RateLimit-Limit",
    "RateLimit-Remaining",
    "RateLimit-Reset"
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
    req.user={ email:dec.email, tenant_id:dec.tenant_id };
    next();
  }catch(e){ return res.status(401).json({error:"Invalid token"}); }
};
const adminMiddleware=(req,res,next)=>{
  if((req.headers["x-admin-key"]||"")!==ADMIN_KEY) return res.status(401).json({error:"unauthorized"});
  next();
};
const requirePaid=plan=>{
  return ["basic","pro","pro_plus"].includes(plan);
};

// ---------- DB bootstrap (idempotent) ----------
(async ()=>{
  await q(`
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  CREATE TABLE IF NOT EXISTS tenants(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'trial',
    contact_email TEXT,
    notes TEXT,
    is_demo BOOLEAN DEFAULT false,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
  );
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
  CREATE TABLE IF NOT EXISTS apikeys(
    id UUID PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT false
  );
  CREATE INDEX IF NOT EXISTS apikeys_tenant_idx ON apikeys(tenant_id);

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
})().catch(console.error);

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
      `SELECT id, email, password_hash, tenant_id FROM users WHERE LOWER(email) = $1 LIMIT 1`,
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
    const token = jwt.sign(
      { tenant_id: user.tenant_id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({ ok: true, token });
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

    await q(`INSERT INTO tenants(id,name,plan,trial_started_at,trial_ends_at,trial_status,created_at,updated_at)
             VALUES($1,$1,'trial',$2,$3,'active',$4,$4)
             ON CONFLICT (id) DO UPDATE SET
               name=EXCLUDED.name,
               updated_at=EXCLUDED.updated_at`,
      [company, nowEpoch, endsEpoch, nowEpoch]
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
    const {rows}=await q(`SELECT id AS tenant_id,name,plan,contact_email,trial_started_at,trial_ends_at,trial_status,created_at,updated_at FROM tenants WHERE id=$1`,[req.user.tenant_id]);
    if(!rows.length) return res.status(404).json({error:"tenant not found"});
    res.json({ok:true,...rows[0]});
  }catch(e){ res.status(500).json({error:"me failed"}); }
});

app.get("/usage",authMiddleware,async (req,res)=>{
  const start=new Date(); start.setUTCDate(1); start.setUTCHours(0,0,0,0);
  const startEpoch=Math.floor(start.getTime()/1000);
  const {rows}=await q(`SELECT COUNT(*)::int AS events FROM usage_events WHERE tenant_id=$1 AND created_at>=$2`,[req.user.tenant_id,startEpoch]);
  res.json({ok:true,month_events:rows[0]?.events||0,month_starts_at:startEpoch});
});

// ---------- billing mocks ----------
app.post("/billing/mock-activate",authMiddleware,async (req,res)=>{
  try{
    const plan=(req.body?.plan||"").toLowerCase();
    if(!["basic","pro","pro_plus"].includes(plan)) return res.status(400).json({error:"bad plan"});
    await q(`UPDATE tenants SET plan=$1,updated_at=EXTRACT(EPOCH FROM NOW()) WHERE id=$2`,[plan,req.user.tenant_id]);
    res.json({ok:true,plan});
  }catch(e){ res.status(500).json({error:"activate failed"}); }
});

app.post("/billing/activate",authMiddleware,async (req,res)=>{
  try{
    const plan=(req.body?.plan||"").toLowerCase();
    if(!["basic","pro","pro_plus"].includes(plan)) return res.status(400).json({error:"bad plan"});
    await q(`UPDATE tenants SET plan=$1,updated_at=EXTRACT(EPOCH FROM NOW()) WHERE id=$2`,[plan,req.user.tenant_id]);
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

// ---------- apikeys ----------
app.post("/apikeys",authMiddleware,async (req,res)=>{
  const {rows}=await q(`SELECT plan FROM tenants WHERE id=$1`,[req.user.tenant_id]);
  const plan=rows[0]?.plan||"trial";
  if(!requirePaid(plan)) return res.status(403).json({error:"plan not active"});
  const id=uuidv4();
  await q(`INSERT INTO apikeys(id,tenant_id,created_at) VALUES($1,$2,$3)`,[id,req.user.tenant_id,now()]);
  res.json({ok:true,api_key:id});
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

// ---------- ingest helpers ----------
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
    const {rows}=await q(`SELECT plan FROM tenants WHERE id=$1`,[tenant_id]);
    if(!requirePaid(rows[0]?.plan||"trial")) return res.status(403).json({error:"plan not active"});
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
  const {rows}=await q(`SELECT plan FROM tenants WHERE id=$1`,[tenant_id]);
  if(!["pro","pro_plus"].includes(rows[0]?.plan)) return res.status(403).json({error:"plan not active"});
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
  const {rows}=await q(`SELECT plan FROM tenants WHERE id=$1`,[tenant_id]);
  if(!["pro","pro_plus"].includes(rows[0]?.plan)) return res.status(403).json({error:"plan not active"});
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
  const {rows}=await q(`SELECT plan FROM tenants WHERE id=$1`,[tenant_id]);
  if(!["pro","pro_plus"].includes(rows[0]?.plan)) return res.status(403).json({error:"plan not active"});
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
  const {rows}=await q(`SELECT plan FROM tenants WHERE id=$1`,[tenant_id]);
  if(rows[0]?.plan!=="pro_plus") return res.status(403).json({error:"plan not active"});
  await saveUsage(tenant_id,"cloud");
  res.json({ok:true});
});

// ---------- views ----------
app.get("/alerts",authMiddleware,async (req,res)=>{
  const {rows}=await q(`SELECT id,tenant_id,event_json AS event,score,status,created_at FROM alerts WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200`,[req.user.tenant_id]);
  res.json({ok:true,alerts:rows});
});
app.get("/actions",authMiddleware,async (req,res)=>{
  const {rows}=await q(`SELECT id,alert_id,tenant_id,action,target_kind,result_json,created_at FROM actions WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200`,[req.user.tenant_id]);
  res.json({ok:true,actions:rows});
});

// ---------- admin (GDPR-aware) ----------
app.get("/admin/tenants",adminMiddleware,async (_req,res)=>{
  const {rows}=await q(`
    SELECT t.id,t.name,t.plan,t.created_at,
     (SELECT COUNT(*) FROM users u WHERE u.tenant_id=t.id) AS users,
     (SELECT COUNT(*) FROM apikeys k WHERE k.tenant_id=t.id AND NOT k.revoked) AS active_keys,
     (SELECT MAX(created_at) FROM alerts a WHERE a.tenant_id=t.id) AS last_alert
    FROM tenants t ORDER BY t.created_at DESC LIMIT 500`);
  res.json({ok:true,tenants:rows});
});
app.get("/admin/tenant/:id",adminMiddleware,async (req,res)=>{
  const {rows}=await q(`SELECT id,name,plan,contact_email,created_at,updated_at,is_demo FROM tenants WHERE id=$1`,[req.params.id]);
  res.json({ok:true,tenant:rows[0]||null});
});
app.get("/admin/tenant/:id/keys",adminMiddleware,async (req,res)=>{
  const {rows}=await q(`SELECT id,revoked,created_at FROM apikeys WHERE tenant_id=$1 ORDER BY created_at DESC`,[req.params.id]);
  res.json({ok:true,keys:rows});
});
app.post("/admin/revoke-key",adminMiddleware,async (req,res)=>{
  const {id}=req.body||{}; if(!id) return res.status(400).json({error:"id required"});
  await q(`UPDATE apikeys SET revoked=true WHERE id=$1`,[id]);
  res.json({ok:true});
});
app.get("/admin/sar.csv",adminMiddleware,async (_req,res)=>{
  const {rows}=await q(`SELECT id,name,plan,created_at,updated_at FROM tenants ORDER BY created_at`);
  const lines=["id,name,plan,created_at,updated_at",...rows.map(r=>`${JSON.stringify(r.id)},${JSON.stringify(r.name)},${r.plan},${r.created_at},${r.updated_at}`)];
  res.setHeader("Content-Type","text/csv"); res.send(lines.join("\n"));
});

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

// ---------- start ----------
app.listen(PORT,()=>console.log(`${BRAND} listening on :${PORT}`));
