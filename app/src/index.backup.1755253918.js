import express from "express";
import cors from "cors";
import pg from "pg";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

// ---------- Config ----------
const PORT = process.env.PORT || 8080;
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://cybermon:cyberpass@localhost:5432/cyberguardpro";
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_key";
const ADMIN_KEY = process.env.ADMIN_KEY || ""; // set when starting server
const BRAND = "CyberGuard Pro";

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: false });

// ---------- App ----------
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ---------- Helpers ----------
const nowSec = () => Math.floor(Date.now() / 1000);
async function q(sql, params) { return pool.query(sql, params); }

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });
}
function authMiddleware(req, res, next) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer (.+)$/i);
  if (!m) return res.status(401).json({ error: "Missing Bearer token" });
  try {
    req.user = jwt.verify(m[1], JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}
function adminMiddleware(req, res, next) {
  if (!ADMIN_KEY) return res.status(403).json({ error: "admin key not set" });
  if (req.headers["x-admin-key"] !== ADMIN_KEY)
    return res.status(403).json({ error: "forbidden" });
  next();
}

// ---------- Root / Health ----------
app.get("/", (_req, res) =>
  res.json({ ok: true, service: `${BRAND} Cloud API`, version: "2.1.0" }),
);

// ---------- Bootstrap tables on first register ----------
app.post("/auth/register", async (req, res) => {
  const { company, email, password } = req.body || {};
  if (!company || !email || !password)
    return res.status(400).json({ error: "company, email, password required" });

  try {
    await q(
      `CREATE TABLE IF NOT EXISTS tenants(
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        plan TEXT NOT NULL DEFAULT 'trial',
        contact_email TEXT,
        notes TEXT,
        is_demo BOOLEAN DEFAULT false,
        created_at BIGINT NOT NULL,
        updated_at BIGINT
      );
       CREATE TABLE IF NOT EXISTS users(
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        pass_hash TEXT NOT NULL,
        created_at BIGINT NOT NULL
      );
       CREATE TABLE IF NOT EXISTS apikeys(
        id UUID PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        revoked BOOLEAN NOT NULL DEFAULT false
      );
       CREATE TABLE IF NOT EXISTS alerts(
        id UUID PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        event_json JSONB NOT NULL,
        score NUMERIC NOT NULL,
        status TEXT NOT NULL,
        created_at BIGINT NOT NULL
      );
       CREATE TABLE IF NOT EXISTS actions(
        id UUID PRIMARY KEY,
        alert_id UUID NOT NULL,
        action TEXT NOT NULL,
        target_kind TEXT,
        created_at BIGINT NOT NULL
      );
       CREATE TABLE IF NOT EXISTS policy(
        tenant_id TEXT PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT true,
        threshold NUMERIC NOT NULL DEFAULT -0.6,
        feeds JSONB NOT NULL DEFAULT '{"email":true,"edr":true,"dns":true,"ueba":true}'
      );`,
    );

    const tid = company; // using company name as tenant id
    await q(
      `INSERT INTO tenants(id,name,plan,created_at,updated_at)
       VALUES($1,$2,'trial',$3,$3)
       ON CONFLICT (id) DO NOTHING`,
      [tid, company, nowSec()],
    );

    const hash = await bcrypt.hash(password, 10);
    await q(
      `INSERT INTO users(id,tenant_id,email,pass_hash,created_at)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT (email) DO NOTHING`,
      [email, tid, email, hash, nowSec()],
    );

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "register failed" });
  }
});

// ---------- Auth Login ----------
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "email, password required" });
  try {
    const { rows } = await q(
      `SELECT u.email,u.pass_hash,u.tenant_id FROM users u WHERE u.email=$1 LIMIT 1`,
      [email],
    );
    if (!rows.length) return res.status(401).json({ error: "invalid credentials" });
    const ok = await bcrypt.compare(password, rows[0].pass_hash);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });
    const token = signToken({
      tenant_id: rows[0].tenant_id,
      email: rows[0].email,
    });
    res.json({ token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "login failed" });
  }
});

// ---------- Billing (Mock Activate Plan) ----------
app.post("/billing/mock-activate", authMiddleware, async (req, res) => {
  const plan = (req.body?.plan || "").toLowerCase();
  if (!["basic", "pro", "pro_plus", "trial"].includes(plan))
    return res.status(400).json({ error: "invalid plan" });
  try {
    await q(
      `UPDATE tenants SET plan=$1, updated_at=$2 WHERE id=$3`,
      [plan, nowSec(), req.user.tenant_id],
    );
    res.json({ ok: true, plan });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "activate failed" });
  }
});

// ---------- API Keys ----------
app.post("/apikeys", authMiddleware, async (req, res) => {
  try {
    const id = uuidv4();
    await q(
      `INSERT INTO apikeys(id,tenant_id,created_at,revoked) VALUES($1,$2,$3,false)`,
      [id, req.user.tenant_id, nowSec()],
    );
    res.json({ ok: true, api_key: id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "create key failed" });
  }
});

// ---------- Policy ----------
app.get("/policy", authMiddleware, async (req, res) => {
  try {
    const { rows } = await q(`SELECT enabled,threshold,feeds FROM policy WHERE tenant_id=$1`, [
      req.user.tenant_id,
    ]);
    if (!rows.length) {
      return res.json({
        enabled: true,
        threshold: -0.6,
        feeds: { email: true, edr: true, dns: true, ueba: true },
      });
    }
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "policy get failed" });
  }
});
app.post("/policy", authMiddleware, async (req, res) => {
  try {
    const { enabled = true, threshold = -0.6, feeds = { email: true, edr: true, dns: true, ueba: true } } =
      req.body || {};
    await q(
      `INSERT INTO policy(tenant_id,enabled,threshold,feeds)
       VALUES($1,$2,$3,$4)
       ON CONFLICT (tenant_id) DO UPDATE SET enabled=$2, threshold=$3, feeds=$4`,
      [req.user.tenant_id, !!enabled, Number(threshold), feeds],
    );
    res.json({ enabled: !!enabled, threshold: Number(threshold), feeds });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "policy set failed" });
  }
});

// ---------- Me (tenant profile-lite for logged-in user) ----------
app.get("/me", authMiddleware, async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT id AS tenant_id, name, plan, contact_email, created_at, updated_at
       FROM tenants WHERE id=$1`,
      [req.user.tenant_id]
    );
    if (!rows.length) return res.status(404).json({ error: "tenant not found" });
    res.json({ ok: true, ...rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "me failed" });
  }
});

// ---------- Ingest helpers ----------
async function tenantFromKey(apikey) {
  if (!apikey) return null;
  const { rows } = await q(
    `SELECT tenant_id FROM apikeys WHERE id=$1 AND revoked=false LIMIT 1`,
    [apikey],
  );
  return rows[0]?.tenant_id || null;
}
async function raiseAlert(tenant_id, event, score) {
  const id = uuidv4();
  await q(
    `INSERT INTO alerts(id, tenant_id, event_json, score, status, created_at)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [id, tenant_id, event, score, "new", nowSec()],
  );
  return id;
}
async function recordAction(alert_id, action, target_kind) {
  const id = uuidv4();
  await q(
    `INSERT INTO actions(id, alert_id, action, target_kind, created_at)
     VALUES($1,$2,$3,$4,$5)`,
    [id, alert_id, action, target_kind, nowSec()],
  );
  return id;
}
async function maybeAutoRemediate(tenant_id, evtType, score) {
  const { rows } = await q(`SELECT enabled,threshold,feeds FROM policy WHERE tenant_id=$1`, [
    tenant_id,
  ]);
  const pol =
    rows[0] || { enabled: true, threshold: -0.6, feeds: { email: true, edr: true, dns: true, ueba: true } };
  const feedOn = !!pol.feeds?.[evtType];
  return pol.enabled && feedOn && Number(score) <= Number(pol.threshold);
}

// ---------- Ingest: EDR / DNS / Logs(UEBA) / Email ----------
app.post("/edr/ingest", async (req, res) => {
  const key = req.headers["x-api-key"];
  const tenant_id = await tenantFromKey(key);
  if (!tenant_id) return res.status(401).json({ error: "Invalid API key" });

  const events = req.body?.events || [];
  const results = [];
  for (const e of events) {
    const event = { type: "edr", ...e };
    let score = -0.1;
    const cmd = (e.cmdline || "").toLowerCase();
    if (cmd.includes(" -enc ") || cmd.includes("frombase64string")) score = Math.min(score, -0.6);
    if (e.file_ops?.burst && e.file_ops.burst > 1000) score = Math.min(score, -0.6);
    const alertId = await raiseAlert(tenant_id, event, score);
    if (await maybeAutoRemediate(tenant_id, "edr", score)) {
      await recordAction(alertId, "quarantine", "edr");
      await q(`UPDATE alerts SET status='remediated' WHERE id=$1`, [alertId]);
    }
    results.push({ score, anomaly: score <= -0.5 });
  }
  res.json({ tenant_id, results });
});

app.post("/dns/ingest", async (req, res) => {
  const key = req.headers["x-api-key"];
  const tenant_id = await tenantFromKey(key);
  if (!tenant_id) return res.status(401).json({ error: "Invalid API key" });

  const events = req.body?.events || [];
  const results = [];
  for (const e of events) {
    const event = { type: "dns", ...e };
    let score = -0.1;
    if (e.newly_registered || String(e.verdict || "").includes("dns-tunnel")) score = -1;
    const alertId = await raiseAlert(tenant_id, event, score);
    if (await maybeAutoRemediate(tenant_id, "dns", score)) {
      await recordAction(alertId, "dns_deny", "dns");
      await q(`UPDATE alerts SET status='remediated' WHERE id=$1`, [alertId]);
    }
    results.push({ score, anomaly: score <= -0.5 });
  }
  res.json({ tenant_id, results });
});

app.post("/logs/ingest", async (req, res) => {
  const key = req.headers["x-api-key"];
  const tenant_id = await tenantFromKey(key);
  if (!tenant_id) return res.status(401).json({ error: "Invalid API key" });

  const events = req.body?.events || [];
  const results = [];
  for (const e of events) {
    const event = { type: "ueba", ...e };
    let score = -0.2;
    if (e.anomaly === "impossible_travel" || e.off_hours || e.mass_download) score = -1;
    const alertId = await raiseAlert(tenant_id, event, score);
    if (await maybeAutoRemediate(tenant_id, "ueba", score)) {
      await recordAction(alertId, "disable_account", "ueba");
      await q(`UPDATE alerts SET status='remediated' WHERE id=$1`, [alertId]);
    }
    results.push({ score, anomaly: score <= -0.5 });
  }
  res.json({ tenant_id, results });
});

app.post("/email/scan", async (req, res) => {
  const key = req.headers["x-api-key"];
  const tenant_id = await tenantFromKey(key);
  if (!tenant_id) return res.status(401).json({ error: "Invalid API key" });

  const emails = req.body?.emails || [];
  const results = [];
  for (const e of emails) {
    const event = { type: "email", email: { from: e.from, subject: e.subject } };
    let score = -0.2;
    const disp = (e.display_name_domain || "").toLowerCase();
    const fromd = (e.from_domain || "").toLowerCase();
    if (disp && fromd && disp !== fromd) score = -1; // display name spoofing
    if (e.has_attachments && (e.attachment_types || []).includes("zip")) score = Math.min(score, -0.6);
    if (e.spf_pass === false || e.dkim_pass === false || e.dmarc_pass === false) score = Math.min(score, -0.6);
    const alertId = await raiseAlert(tenant_id, { type: "email", ...e }, score);
    if (await maybeAutoRemediate(tenant_id, "email", score)) {
      await recordAction(alertId, "quarantine_email", "email");
      await q(`UPDATE alerts SET status='remediated' WHERE id=$1`, [alertId]);
    }
    results.push({ email: event.email, score, anomaly: score <= -0.5 });
  }
  res.json({ tenant_id, results });
});

// ---------- Tenant views ----------
app.get("/alerts", authMiddleware, async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT id, tenant_id, event_json AS event, score, status, created_at
       FROM alerts WHERE tenant_id=$1
       ORDER BY created_at DESC
       LIMIT 200`,
      [req.user.tenant_id],
    );
    res.json({ ok: true, alerts: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "alerts failed" });
  }
});

app.get("/actions", authMiddleware, async (_req, res) => {
  try {
    const { rows } = await q(
      `SELECT id, alert_id, action, target_kind, created_at
       FROM actions ORDER BY created_at DESC LIMIT 200`,
    );
    res.json({ ok: true, actions: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "actions failed" });
  }
});

// ==================== ADMIN (GDPR-safe) ====================

// List tenants summary
app.get("/admin/tenants", adminMiddleware, async (_req, res) => {
  try {
    const { rows } = await q(`
      SELECT t.id, t.name, t.plan, t.created_at,
        (SELECT COUNT(*) FROM users u WHERE u.tenant_id=t.id) AS users,
        (SELECT COUNT(*) FROM apikeys k WHERE k.tenant_id=t.id AND NOT k.revoked) AS active_keys,
        (SELECT MAX(created_at) FROM alerts a WHERE a.tenant_id=t.id) AS last_alert
      FROM tenants t
      ORDER BY t.created_at DESC
      LIMIT 1000
    `);
    res.json({ ok: true, tenants: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "admin tenants failed" });
  }
});

// Tenant profile
app.get("/admin/tenant/:id", adminMiddleware, async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT id, name, plan, contact_email, notes, is_demo, created_at, updated_at
       FROM tenants WHERE id=$1`,
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: "tenant not found" });
    res.json({ ok: true, tenant: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "admin tenant get failed" });
  }
});

// Update tenant profile
app.patch("/admin/tenant/:id", adminMiddleware, async (req, res) => {
  try {
    const { name, contact_email, notes, is_demo, plan } = req.body || {};
    const fields = [];
    const vals = [];
    let i = 1;
    if (typeof name === "string") { fields.push(`name=$${i++}`); vals.push(name); }
    if (typeof contact_email === "string") { fields.push(`contact_email=$${i++}`); vals.push(contact_email); }
    if (typeof notes === "string") { fields.push(`notes=$${i++}`); vals.push(notes); }
    if (typeof is_demo === "boolean") { fields.push(`is_demo=$${i++}`); vals.push(is_demo); }
    if (typeof plan === "string") { fields.push(`plan=$${i++}`); vals.push(plan); }
    fields.push(`updated_at=EXTRACT(EPOCH FROM NOW())`);
    if (vals.length === 0) return res.json({ ok: true, updated: false });
    vals.push(req.params.id);
    const sql = `UPDATE tenants SET ${fields.join(", ")} WHERE id=$${i}
                 RETURNING id,name,plan,contact_email,notes,is_demo,created_at,updated_at`;
    const { rows } = await q(sql, vals);
    res.json({ ok: true, tenant: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "admin tenant patch failed" });
  }
});

// List tenant keys
app.get("/admin/tenant/:id/keys", adminMiddleware, async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT id, created_at, revoked FROM apikeys WHERE tenant_id=$1 ORDER BY created_at DESC`,
      [req.params.id],
    );
    res.json({ ok: true, keys: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "admin keys failed" });
  }
});

// Revoke key
app.post("/admin/revoke-key", adminMiddleware, async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id required" });
    await q(`UPDATE apikeys SET revoked=true WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "admin revoke failed" });
  }
});

// -------------------- Start --------------------
app.listen(PORT, () => {
  console.log(`${BRAND} Cloud API listening on :${PORT}`);
});
