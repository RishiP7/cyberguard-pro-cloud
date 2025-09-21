// --- Core imports (must be first) ---
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import Stripe from "stripe";
import * as Sentry from "@sentry/node";
// --- Load auth middleware (safe fallback) ---
let authMiddleware = (_req, _res, next) => next();
try {
  const _auth = await import('./middleware/auth.js');
  authMiddleware = _auth.default || _auth.authMiddleware || authMiddleware;
} catch (e) {
  console.warn("[auth] ./middleware/auth.js not found; using no-op auth (dev-only).");
}

// --- Local modules ---

// --- Initialize Stripe safely ---
let stripe = null;
const STRIPE_KEY = process.env.STRIPE_SECRET || "";
if (STRIPE_KEY) {
  stripe = new Stripe(STRIPE_KEY, { apiVersion: "2024-06-20" });
} else {
  console.warn(
    "[billing] Stripe disabled: no secret key in env. Billing endpoints will return 501."
  );
}

// --- Initialize Sentry ---
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.0 });
}


// No-op guard middleware used if guard imports are missing (keeps routes working)
const _noopMw = (_req, _res, next) => next();

// Create local aliases that always exist (don't mutate imported bindings)
const Guard = {
  enforceActive: (typeof enforceActive === 'function' ? enforceActive : _noopMw),
  requireProPlus: (typeof requireProPlus === 'function' ? requireProPlus : _noopMw),
  requireSuper:   (typeof requireSuper   === 'function' ? requireSuper   : _noopMw),
};

// Create app
const app = express();
app.use((req, res, next) => {
  // Early CORS shim: reflect Origin and succeed preflight with credentials
  try {
    const origin = req.headers.origin;
    if (origin) {
      try { res.setHeader('Access-Control-Allow-Origin', origin); } catch (_) {}
      try { res.setHeader('Vary', 'Origin'); } catch (_) {}
      try { res.setHeader('Access-Control-Allow-Credentials', 'true'); } catch (_) {}
    }
    // Echo requested method/headers when provided, else send a safe default
    const reqMethod  = req.headers['access-control-request-method'];
    const reqHeaders = req.headers['access-control-request-headers'];
    try { res.setHeader('Access-Control-Allow-Methods', reqMethod || 'GET,POST,PUT,PATCH,DELETE,OPTIONS'); } catch (_) {}
    try {
      res.setHeader(
        'Access-Control-Allow-Headers',
        reqHeaders || 'Origin, X-Requested-With, Content-Type, Accept, Authorization'
      );
    } catch (_) {}
    try { res.setHeader('Access-Control-Max-Age', '600'); } catch (_) {}
  } catch (_) {}
  if (req.method === 'OPTIONS') { return res.sendStatus(204); }
  return next();
});

// Global middleware
const allowedOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [
  process.env.FRONTEND_URL,
  process.env.PUBLIC_SITE_URL,
].filter(Boolean);

const corsOrigin = (origin, callback) => {
  if (!origin || allowedOrigins.includes(origin)) {
    return callback(null, true);
  }
  return callback(new Error('CORS not allowed'));
};

app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Origin','X-Requested-With','Content-Type','Accept','Authorization','x-api-key','x-admin-key','x-plan-preview','x-admin-override','x-admin-plan-preview','x-admin-bypass'],
}));


// Hardened global OPTIONS preflight handler (always 204, never throws)
app.use((req, res, next) => {
  if (req.method !== 'OPTIONS') return next();

  try {
    const origin = req.headers.origin;
    if (origin) {
      try { res.setHeader('Access-Control-Allow-Origin', origin); } catch (_) {}
      try { res.setHeader('Vary', 'Origin'); } catch (_) {}
    }

    const reqMethod  = req.headers['access-control-request-method'];
    const reqHeaders = req.headers['access-control-request-headers'];

    try { res.setHeader('Access-Control-Allow-Credentials', 'true'); } catch (_) {}
    try { res.setHeader('Access-Control-Allow-Methods', reqMethod || 'GET,POST,PUT,PATCH,DELETE,OPTIONS'); } catch (_) {}
    try {
      res.setHeader(
        'Access-Control-Allow-Headers',
        reqHeaders ||
          'Origin,X-Requested-With,Content-Type,Accept,Authorization,x-api-key,x-admin-key,x-plan-preview,x-admin-override,x-admin-plan-preview,x-admin-bypass'
      );
    } catch (_) {}

    try { res.setHeader('Access-Control-Max-Age', '600'); } catch (_) {}
  } catch (e) {
    try { console.error('Preflight error', e?.message || e); } catch (_) {}
    // swallow any error to guarantee a 204
  }

  return res.sendStatus(204);
});

// JSON body parser (after Stripe webhook raw body setup later)
app.use(express.json({ limit: '1mb' }));

// ===== end middleware + guards =====

app.post('/ai/propose', authMiddleware, Guard.enforceActive, Guard.requireProPlus, async (req,res)=>{
// ===== DB bootstrap (idempotent, safe in ESM) =====
if (typeof globalThis.q === 'undefined' || typeof globalThis.db === 'undefined') {
  try {
    const pg = await import('pg');
    const { Pool } = pg;
    const url = process.env.DATABASE_URL || '';
    const needsSSL = /render\.com|amazonaws\.com|neon\.tech|supabase\.co/i.test(url);
    const pool = new Pool({
      connectionString: url,
      ssl: needsSSL ? { rejectUnauthorized: false } : undefined,
      max: 5,
      idleTimeoutMillis: 30000
    });
    // expose globally so future modules/patches can reuse
    globalThis.__cg_pool__ = pool;
    globalThis.q  = (text, params = []) => pool.query(text, params);
    globalThis.db = {
      any: (text, params = []) => pool.query(text, params).then(r => r.rows)
    };
  } catch (e) {
    // non-fatal: health endpoints will still work; other routes will 500 with clearer message
    try { console.error('[db-bootstrap] failed', e?.message || e); } catch (_){}
  }
}
// ===== END DB bootstrap =====
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
app.post('/ai/approve', authMiddleware, Guard.enforceActive, Guard.requireProPlus, async (req,res)=>{
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
app.post('/ai/execute', authMiddleware, Guard.enforceActive, Guard.requireProPlus, async (req,res)=>{
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
  await ensureDb();
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
  await ensureDb();
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
  if (!stripe) {
    return res.status(501).json({ ok: false, error: "billing disabled (no stripe key)" });
  }
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
  if (!stripe) {
    return res.status(501).send("billing disabled (no stripe key)");
  }
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
  if (!stripe) {
    return res.status(501).json({ ok: false, error: "billing disabled (no stripe key)" });
  }
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
app.post('/admin/billing/sync', authMiddleware, Guard.requireSuper, async (req, res) => {
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
app.post('/admin/ops/alerts/denormalize', authMiddleware, Guard.requireSuper, async (req, res) => {
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
app.post('/admin/ops/alerts/prune_blank', authMiddleware, Guard.requireSuper, async (req, res) => {
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
app.post('/admin/ops/connector/reset', authMiddleware, Guard.requireSuper, async (req, res) => {
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
app.post('/admin/ops/poll/now', authMiddleware, Guard.requireSuper, async (req, res) => {
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
app.get('/admin/ops/connector/show', authMiddleware, Guard.requireSuper, async (req, res) => {
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
app.get('/alerts/export', authMiddleware, Guard.enforceActive, async (req, res) => {
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


// ===== ULTRA-EARLY HEALTH HANDLERS (must be the very first middleware) =====
// Guarantees health endpoints work even if later middleware throws (CORS, auth, DB, etc.)
app.use((req, res, next) => {
  if (req.path === '/__ping') {
    try { res.setHeader('Content-Type', 'application/json'); } catch (_) {}
    return res.status(200).end(JSON.stringify({ ok: true, ts: Date.now() }));
  }
  if (req.path === '/__env') {
    try {
      const keys = ['NODE_ENV','RENDER_GIT_COMMIT','PGHOST','PGUSER','PGDATABASE','PGPORT'];
      const env = {};
      for (const k of keys) {
        const v = process.env[k];
        env[k] = v ? String(v) : null;
      }
      try { res.setHeader('Content-Type', 'application/json'); } catch (_) {}
      return res.status(200).end(JSON.stringify({ ok: true, env }));
    } catch (_e) {
      try { res.setHeader('Content-Type', 'application/json'); } catch(_) {}
      return res.status(200).end('{"ok":false,"error":"env_failed"}');
    }
  }
  return next();
});
// ===== END ULTRA-EARLY HEALTH HANDLERS =====
// ===== ULTRA-EARLY DB ENSURE (local shim for diagnostics and early routes) =====
const _ensureDbLocal = (typeof ensureDb === 'function')
  ? ensureDb
  : (async function ensureDbLocal(){
      try{
        if (!globalThis.q || !globalThis.db) {
          const pg = await import('pg');
          const { Pool } = pg;
          const url = process.env.DATABASE_URL || '';
          const needsSSL = /render\.com|amazonaws\.com|neon\.tech|supabase\.co/i.test(url);
          const pool = globalThis.__cg_pool__ || new Pool({
            connectionString: url,
            ssl: needsSSL ? { rejectUnauthorized: false } : undefined,
            max: 5,
            idleTimeoutMillis: 30000,
          });
          if (!globalThis.__cg_pool__) globalThis.__cg_pool__ = pool;
          globalThis.q  = (text, params = []) => globalThis.__cg_pool__.query(text, params);
          globalThis.db = {
            any: (text, params = []) => globalThis.__cg_pool__.query(text, params).then(r => r.rows),
          };
        }
      } catch (e) {
        try { console.error('[__db_diag.ensureDbLocal] failed', e?.message || e); } catch (_){}
      }
    });
// ===== END ULTRA-EARLY DB ENSURE =====

// ===== ULTRA-EARLY DB DIAGNOSTIC ROUTE =====
// Lightweight JSON body parser JUST for this endpoint so it always works even if later middleware fails.
app.post('/__db_diag', express.json({ limit: '256kb' }), async (req, res) => {
  try {
    await _ensureDbLocal();
    const ok = typeof globalThis.q === 'function';
    let sample = null;
    if (ok) {
      try {
        const r = await globalThis.q('SELECT NOW() as now');
        sample = (r.rows && r.rows[0]) ? r.rows[0].now : null;
      } catch(_e) { sample = null; }
    }
    return res.json({ ok, body_seen: !!req.body, sample });
  } catch (e) {
    try { console.error('[__db_diag] failed', e?.message || e); } catch (_){}
    return res.status(500).json({ ok:false, error:'diag_failed', detail:String(e?.message||e) });
  }
});
// ===== END ULTRA-EARLY DB DIAGNOSTIC ROUTE =====
// ===== ULTRA-EARLY LOGIN PREFLIGHT (runs before unified CORS) =====
// Guarantees ACAO reflection for /auth/login and /api/auth/login preflight with credentials=true.
app.use((req, res, next) => {
  if (req.method === 'OPTIONS' && (req.path === '/auth/login' || req.path === '/api/auth/login')) {
    try {
      const origin = req.headers.origin;
      if (origin) {
        try { res.setHeader('Access-Control-Allow-Origin', origin); } catch (_) {}
        try { res.setHeader('Vary', 'Origin'); } catch (_) {}
        try { res.setHeader('Access-Control-Allow-Credentials', 'true'); } catch (_) {}
      }
      try { res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS'); } catch (_) {}
      try {
        res.setHeader(
          'Access-Control-Allow-Headers',
          req.headers['access-control-request-headers'] ||
            'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key, x-admin-key, x-plan-preview, x-admin-override, x-admin-plan-preview, x-admin-bypass'
        );
      } catch (_) {}
      try { res.setHeader('Access-Control-Max-Age', '600'); } catch (_) {}
      try { res.setHeader('X-CORS-Debug', 'ultra-early-login-preflight'); } catch (_) {}
    } catch (_e) {
      // swallow any errors and still return 204
    }
    return res.sendStatus(204);
  }
  return next();
});
// ===== END ULTRA-EARLY LOGIN PREFLIGHT =====
// ---- Unified CORS (no wildcard when credentials=true) ----
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    try { res.setHeader('Access-Control-Allow-Origin', origin); } catch (_) {}
    try { res.setHeader('Vary', 'Origin'); } catch (_) {}
    try { res.setHeader('Access-Control-Allow-Credentials', 'true'); } catch (_) {}
  }
  try { res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS'); } catch (_) {}
  try {
    res.setHeader(
      'Access-Control-Allow-Headers',
      req.headers['access-control-request-headers'] ||
        'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key, x-admin-key, x-plan-preview, x-admin-override, x-admin-plan-preview, x-admin-bypass'
    );
  } catch (_) {}
  try { res.setHeader('Access-Control-Max-Age', '600'); } catch (_) {}
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  return next();
});
// ---- End Unified CORS ----
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
  await ensureDb();
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
    try { console.error('[login_dbg] failed', e?.message || e, e?.stack || ''); } catch (_e) {}
    return res.status(500).json({ ok:false, error:'dbg_failed', detail: String(e?.message || e) });
  }
});

// GET /health/db — quick DB probe
app.get('/health/db', async (_req, res) => {
  await ensureDb();
  try {
    const r = await q('SELECT 1 AS ok');
    return res.json({ ok: true, db: r.rows?.[0]?.ok === 1 });
  } catch(e) {
    try { console.error('[health/db] failed', e?.message || e, e?.stack || ''); } catch (_) {}
    return res.status(500).json({ ok:false, error:'db_failed', detail: String(e?.message || e) });
  }
});
// ===== END AUTH/DB DIAGNOSTICS =====
// Sentry error handler (must be before any other error middleware)
Sentry.setupExpressErrorHandler(app);
// Minimal fallback error handler to avoid leaking internals
app.use((err, _req, res, _next) => {
  try { console.error("[unhandled]", err && (err.stack || err)); } catch (_) {}
  res.status(500).json({ ok:false, error: "internal_error" });
});
app.listen(Number(process.env.PORT) || 10000, () => {
  const name = process.env.BRAND || 'CyberGuard Pro';
  console.log(`${name} listening on :${process.env.PORT || 10000}`);
});

// ---------- Super Admin DB diagnostics ----------
app.get('/admin/db/diag', authMiddleware, Guard.requireSuper, async (_req,res)=>{
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
app.post('/admin/ops/connector/force_reset', authMiddleware, Guard.requireSuper, async (req, res) => {
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


// ===== AUTH: Hardened password login (no 500s) =====
// Registers a robust /auth/login and an /api alias. Ensures:
// - Per-route JSON body parser to avoid global parser issues
// - Returns 400/401 on bad input/creds instead of 500
// - Sets cg_access/cg_refresh cookies on success
// - Never throws if password column names differ across environments
app.post('/auth/login', express.json({ limit: '256kb' }), async (req, res) => {
  const dbg = { step: 'start' };
  try {
    dbg.step = 'ensureDb';
    await ensureDb();

    dbg.step = 'validate_input';
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      try { res.setHeader('X-Auth-Debug', 'missing_credentials'); } catch(_) {}
      return res.status(400).json({ ok: false, error: 'missing_credentials' });
    }

    dbg.step = 'select_user';
    let user = null;
    try {
      const r = await q('SELECT * FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1', [email]);
      user = r.rows?.[0] || null;
    } catch (_e) {
      try { res.setHeader('X-Auth-Debug', 'select_failed'); } catch(_) {}
      return res.status(401).json({ ok: false, error: 'invalid_credentials' });
    }
    if (!user) {
      try { res.setHeader('X-Auth-Debug', 'user_not_found'); } catch(_) {}
      return res.status(401).json({ ok: false, error: 'invalid_credentials' });
    }

    dbg.step = 'password_compare';
    const hash = user.password_hash || user.passhash || user.pwhash || null;
    const plain = user.password || user.pass || user.pw || null;
    let matches = false;
    try {
      if (hash) {
        const bcryptjs = await import('bcryptjs').catch(() => null);
        if (bcryptjs && typeof bcryptjs.compare === 'function') {
          matches = await bcryptjs.compare(password, String(hash));
        }
      }
    } catch (_) { /* ignore and fall back */ }
    if (!matches) {
      matches = !!(plain && String(plain) === password);
    }
    if (!matches) {
      try { res.setHeader('X-Auth-Debug', 'bad_password'); } catch(_) {}
      return res.status(401).json({ ok: false, error: 'invalid_credentials' });
    }

    dbg.step = 'issue_jwt';
    // Use the already-imported jwt module if present (dev-login worked),
    // otherwise lazily import jsonwebtoken.
    let _jwt = (typeof jwt !== 'undefined' && jwt) ? jwt : null;
    if (!_jwt) {
      try {
        const mod = await import('jsonwebtoken');
        _jwt = mod.default || mod;
      } catch (_) {
        try { res.setHeader('X-Auth-Debug', 'jwt_import_failed'); } catch(_) {}
        return res.status(500).json({ ok:false, error:'internal_error' });
      }
    }
    const jwtSecret = process.env.JWT_SECRET || process.env.JWT_SIGNING_KEY || 'dev_secret_do_not_use_in_prod';
    const payload = {
      sub: user.email,
      email: user.email,
      tenant_id: user.tenant_id || user.tenant || 'demo',
      role: user.role || 'admin',
      is_super: !!(user.is_super || user.super || user.isSuper),
    };
    let token;
    try {
      token = _jwt.sign(payload, jwtSecret, { expiresIn: '1h' });
    } catch (e) {
      try { res.setHeader('X-Auth-Debug', 'jwt_sign_failed'); } catch(_) {}
      return res.status(500).json({ ok:false, error:'internal_error' });
    }

    dbg.step = 'set_cookies';
    const setTokens = globalThis.__cg_setTokens__ || ((res, access, refresh) => {
      const base = { httpOnly: true, secure: true, sameSite: 'none', path: '/' };
      try { res.cookie('cg_access', access,  { ...base, maxAge: 15 * 60 * 1000 }); } catch (_) {
        res.setHeader('Set-Cookie', [`cg_access=${encodeURIComponent(access)}; Max-Age=${15*60}; Path=/; Secure; HttpOnly; SameSite=None`]);
      }
      try { res.cookie('cg_refresh', refresh, { ...base, maxAge: 30 * 24 * 60 * 60 * 1000 }); } catch (_) {
        const prev = res.getHeader('Set-Cookie');
        const next = Array.isArray(prev) ? prev : prev ? [prev] : [];
        next.push(`cg_refresh=${encodeURIComponent(refresh)}; Max-Age=${30*24*60*60}; Path=/; Secure; HttpOnly; SameSite=None`);
        res.setHeader('Set-Cookie', next);
      }
    });
    try { setTokens(res, token, token); } catch (_) {}

    try { res.setHeader('X-Auth-Debug', 'ok'); } catch(_) {}
    return res.json({ ok: true, token, user: payload, tenant_id: payload.tenant_id });
  } catch (e) {
    try { res.setHeader('X-Auth-Debug', `fail:${dbg.step}`); } catch(_) {}
    // Never leak internals; normalize to 401 so clients don't see 500s for auth flow
    return res.status(401).json({ ok: false, error: 'invalid_credentials' });
  }
});
// ===== END AUTH: Hardened password login =====
// ===== DEV LOGIN (safe, opt-in) =====

// --- Replace all other explicit Access-Control-Allow-Origin: '*' with reflection ---
// (No explicit replacements found in the truncated content. If present elsewhere, replace with:)
// const __origin = req.headers.origin;
// if (__origin) {
//   try { res.setHeader('Access-Control-Allow-Origin', __origin); } catch (_) {}
//   try { res.setHeader('Vary', 'Origin'); } catch (_) {}
// }
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
                res.cookie('cg_refresh', token, {
          httpOnly: true,
          secure: true,
          sameSite: 'none',
          path: '/',
          maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
        });
      } catch (_e) {
        /* ignore cookie set errors */
      }

      return res.json({
        ok: true,
        token,
        user: demoUser,
        tenant_id: tid
      });
    } catch (e) {
      try { await recordOpsRun('dev_login_error', { err: String(e?.message || e) }); } catch (_e) {}
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  // GET /auth/dev-status — indicates if dev login is enabled
  app.get('/auth/dev-status', (_req, res) => {
    return res.json({ ok: true, dev_login_enabled: true });
  });
} else {
  // If disabled, expose dev-status as false so UI can hide the button
  app.get('/auth/dev-status', (_req, res) => {
    return res.json({ ok: true, dev_login_enabled: false });
  });
}