try {
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

`


// --- minimal boot footer (recovered) ---
try { console.log("[boot] file loaded"); } catch(_){}
const __PORT = Number(process.env.PORT) || 10000;
console.log("[boot] about to app.listen", { port: __PORT });
app.listen(__PORT, () => {
  const name = process.env.BRAND || 'CyberGuard Pro';
  console.log(`[boot] ${name} listening on :${__PORT}`);
});
});
// --- end boot footer ---
